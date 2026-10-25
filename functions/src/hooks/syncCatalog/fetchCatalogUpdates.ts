import { FieldValue } from "firebase-admin/firestore";
import {
  fetchShowFromTMDB,
  fetchShowStatus,
  pooled,
  premiereDate,
  CatalogShow,
} from "../tmdb";
import { MediaType, ENDED_STATUSES } from "../../shared/enums";
import { hasCatalogChanged } from "./hasCatalogChanged";
import { filledRuntimes } from "../runtimeHeal/healRuntimes";
import { tvCatalogFields } from "../catalogFields";

export interface FetchResult {
  freshCatalogMap: Map<string, CatalogShow>;
  pendingWrites: Array<{
    ref: FirebaseFirestore.DocumentReference;

    data: Record<string, any>;
  }>;
  hasEpisodeRemovals: boolean;
  skippedEnded: number;
  /** Show doc ids whose displayed data changed this sync */
  changedShowIds: string[];
  /** Shows where TMDB filled in episode runtimes it didn't have (users' 0-minute watches heal) */
  runtimeFills: Array<{ showId: string; tmdbId: number; runtimes: Map<string, number> }>;
}

export async function fetchCatalogUpdates(
  apiKey: string,
  showsSnap: FirebaseFirestore.QuerySnapshot,
): Promise<FetchResult> {
  const freshCatalogMap = new Map<string, CatalogShow>();
  let hasEpisodeRemovals = false;
  let skippedEnded = 0;
  const changedShowIds: string[] = [];
  const runtimeFills: FetchResult["runtimeFills"] = [];

  const pendingWrites: FetchResult["pendingWrites"] = [];

  const syncTasks = showsSnap.docs.map((showDoc) => async () => {
    const oldData = showDoc.data() as CatalogShow & {
      trackedBy: string[];
      trackedByCount: number;
    };

    // Skipped (ended) shows aren't re-fetched: fill a missing premiere date from the
    // seasons already stored (no extra TMDB call)
    const healPremiere = () => {
      // refreshShow updated this ended show mid-week (missing-data heal) → announce + clear
      if (oldData.refreshedSinceSync) {
        pendingWrites.push({ ref: showDoc.ref, data: { refreshedSinceSync: FieldValue.delete() } });
        changedShowIds.push(showDoc.id);
      }
      if (oldData.firstAirDate) return;
      const firstAirDate = premiereDate(null, oldData.seasons);
      if (!firstAirDate) return;
      pendingWrites.push({ ref: showDoc.ref, data: { firstAirDate } });
      if (!oldData.refreshedSinceSync) changedShowIds.push(showDoc.id);
    };

    // Ended/canceled: lightweight status check only (1 API call vs ~6)
    if (ENDED_STATUSES.includes(oldData.status)) {
      try {
        const freshStatus = await fetchShowStatus(apiKey, oldData.tmdbId);
        if (ENDED_STATUSES.includes(freshStatus)) {
          freshCatalogMap.set(showDoc.id, oldData);
          skippedEnded++;
          healPremiere();
          return;
        }
        console.log(
          `Show revived: ${oldData.title} (${oldData.status} → ${freshStatus})`,
        );
      } catch {
        freshCatalogMap.set(showDoc.id, oldData);
        skippedEnded++;
        healPremiere();
        return;
      }
    }

    try {
      const freshData = await fetchShowFromTMDB(
        apiKey,
        oldData.tmdbId,
        MediaType.TV,
        { tvmazeId: oldData.tvmazeId },
      );

      const oldEpCount = oldData.totalEpisodes ?? 0;
      const newEpCount = freshData.totalEpisodes ?? 0;
      if (newEpCount < oldEpCount) hasEpisodeRemovals = true;
      // refreshShow wrote fresh seasons mid-week (old vs fresh looks equal now) → still changed
      if (oldData.refreshedSinceSync || hasCatalogChanged(oldData, freshData))
        changedShowIds.push(showDoc.id);
      const filled = filledRuntimes(oldData, freshData);
      if (filled.size > 0) {
        runtimeFills.push({ showId: showDoc.id, tmdbId: oldData.tmdbId, runtimes: filled });
      }

      pendingWrites.push({
        ref: showDoc.ref,
        data: {
          ...tvCatalogFields(freshData),
          // refreshShow's change already reached the doc — this sync announces it to clients
          ...(oldData.refreshedSinceSync ? { refreshedSinceSync: FieldValue.delete() } : {}),
        },
      });

      freshCatalogMap.set(showDoc.id, freshData);

      if (newEpCount > oldEpCount) {
        console.log(
          `New content for ${freshData.title}: ${oldEpCount} → ${newEpCount} episodes`,
        );
      }
    } catch (err) {
      freshCatalogMap.set(showDoc.id, oldData);
      console.error(
        `Failed to sync show ${oldData.tmdbId} (${oldData.title}):`,
        err,
      );
    }
  });

  // Fetch from TMDB in batches of 50 (rate-limited, 5 concurrent)
  for (let i = 0; i < syncTasks.length; i += 50) {
    const chunk = syncTasks.slice(i, i + 50);
    await pooled(chunk, 5);

    if (i + 50 < syncTasks.length) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return {
    freshCatalogMap,
    pendingWrites,
    runtimeFills,
    hasEpisodeRemovals,
    skippedEnded,
    changedShowIds,
  };
}
