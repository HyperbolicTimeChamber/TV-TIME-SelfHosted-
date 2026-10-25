import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { fetchShowFromTMDB, CatalogShow } from "../hooks/tmdb";
import { getTmdbApiKey, invalidateApiKeyCache } from "../hooks/apiKey";
import { tvCatalogFields, movieCatalogFields } from "../hooks/catalogFields";
import { propagateRefresh } from "../hooks/refreshShow";
import { showDocId } from "../shared/docId";
import {
  MediaType,
  RefreshReason,
  REFRESH_COOLDOWN_MS,
  REFRESH_MAX_HINT_SEASONS,
} from "../shared/enums";
import { RefreshShowRequest, RefreshShowResponse } from "../shared/types";

type StoredShow = CatalogShow & { trackedBy?: string[]; lastSyncedAt?: unknown };

/** Doc as clients get it — trackedBy (other users' uids) never leaves the server */
function forClient(show: StoredShow): RefreshShowResponse["catalog"] {
  const { trackedBy: _trackedBy, ...rest } = show;
  return rest;
}

/**
 * Shared, deduped TMDB refresh of one catalog doc. Clients call it when their cached catalog
 * looks behind (last listed episode aired without a finale marker, missing poster / titles /
 * credits, or their own TMDB season response differs). The first caller in a cooldown window
 * claims shows/{id}.lastTmdbCheckAt (transaction), re-fetches TMDB with the server key and
 * merges the result; everyone else gets the current doc back (1 read, 0 TMDB calls).
 */
export const refreshShow = onCall(
  {
    maxInstances: 10,
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (request): Promise<RefreshShowResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }
    if (request.data?.warmup) return { refreshed: false, catalog: null };

    const { tmdbId, mediaType, reason, seasons } = request.data as RefreshShowRequest;
    if (
      typeof tmdbId !== "number" ||
      tmdbId <= 0 ||
      !Object.values(MediaType).includes(mediaType) ||
      !Object.values(RefreshReason).includes(reason)
    ) {
      throw new HttpsError("invalid-argument", "tmdbId, mediaType and reason required");
    }
    const hintSeasons = (Array.isArray(seasons) ? seasons : [])
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, REFRESH_MAX_HINT_SEASONS);

    const db = getFirestore();
    const showId = showDocId(tmdbId, mediaType);
    const showRef = db.doc(`shows/${showId}`);
    const now = Date.now();

    // Claim the refresh — concurrent callers across users see the stamp and skip TMDB
    const { old, claimed } = await db.runTransaction(async (tx) => {
      const snap = await tx.get(showRef);
      if (!snap.exists) return { old: null, claimed: false };
      const data = snap.data() as StoredShow;
      if (now - (data.lastTmdbCheckAt ?? 0) < REFRESH_COOLDOWN_MS[reason]) {
        return { old: data, claimed: false };
      }
      tx.update(showRef, { lastTmdbCheckAt: now });
      return { old: data, claimed: true };
    });
    // No doc → addShow creates it (it also sets trackedBy); nothing to refresh here
    if (!old) return { refreshed: false, catalog: null };
    if (!claimed) return { refreshed: false, catalog: forClient(old) };

    let fresh: CatalogShow;
    try {
      const apiKey = await getTmdbApiKey();
      // Latest stored season always (new episodes land there), plus the client's hints;
      // fetchShowFromTMDB adds seasons that are new or changed size on TMDB
      const latest = Math.max(0, ...(old.seasons ?? []).map((s) => s.seasonNumber));
      fresh = await fetchShowFromTMDB(apiKey, tmdbId, mediaType, {
        tvmazeId: old.tvmazeId,
        reuseSeasons: old.seasons ?? [],
        refetchSeasons: latest > 0 ? [...hintSeasons, latest] : hintSeasons,
      });
    } catch (err: any) {
      // Stamp stays → no retry storm while TMDB is down; the caller keeps its cache
      if (err?.response?.status === 401) invalidateApiKeyCache();
      console.error(`[refreshShow] TMDB fetch failed for ${showId}:`, err?.message ?? err);
      return { refreshed: false, catalog: forClient(old) };
    }

    const fields =
      mediaType === MediaType.TV
        ? // Next syncCatalog would see this doc unchanged → flag makes it announce the change
          { ...tvCatalogFields(fresh), refreshedSinceSync: true }
        : movieCatalogFields(fresh);
    await showRef.set(fields, { merge: true });

    const updated: StoredShow = {
      ...old,
      ...fresh,
      lastSyncedAt: old.lastSyncedAt,
      lastTmdbCheckAt: now,
    };
    await propagateRefresh(db, showId, old, updated).catch((err) =>
      console.error(`[refreshShow] propagate failed for ${showId}:`, err),
    );

    return { refreshed: true, catalog: forClient(updated) };
  },
);
