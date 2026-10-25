import { CatalogShow } from "../../shared/types";
import { MediaType } from "../../shared/enums";
import { getAllTrackerUids } from "../trackedBy";
import { pooled } from "../tmdb";
import { addShowToUpcoming } from "../upcoming";
import { filledRuntimes, healUserShowRuntimes } from "../runtimeHeal/healRuntimes";

/** "season_episode" keys of every regular episode a catalog lists */
function episodeKeys(show: Pick<CatalogShow, "seasons">): Set<string> {
  const keys = new Set<string>();
  for (const s of show.seasons ?? []) {
    if (s.seasonNumber === 0) continue;
    for (const e of s.episodes ?? []) keys.add(`${s.seasonNumber}_${e.episodeNumber}`);
  }
  return keys;
}

/** True when the fresh catalog lists an episode the old one didn't */
export function hasNewEpisodes(
  oldShow: Pick<CatalogShow, "seasons">,
  freshShow: Pick<CatalogShow, "seasons">,
): boolean {
  const before = episodeKeys(oldShow);
  for (const k of episodeKeys(freshShow)) if (!before.has(k)) return true;
  return false;
}

/**
 * What syncCatalog does per changed show, for one refreshed show: new episodes land in every
 * tracker's upcoming list, filled-in runtimes heal 0-minute watches. The next sync sees the
 * doc already fresh, so it would skip both. Reads only when something actually changed.
 */
export async function propagateRefresh(
  db: FirebaseFirestore.Firestore,
  showId: string,
  oldShow: CatalogShow,
  freshShow: CatalogShow,
): Promise<void> {
  if (freshShow.mediaType !== MediaType.TV) return;
  const addUpcoming = hasNewEpisodes(oldShow, freshShow);
  const runtimes = filledRuntimes(oldShow, freshShow);
  if (!addUpcoming && runtimes.size === 0) return;

  const uids = await getAllTrackerUids(showId);
  await pooled(
    uids.map((uid) => async () => {
      try {
        if (addUpcoming) {
          await addShowToUpcoming(db, uid, freshShow.tmdbId, MediaType.TV, freshShow);
        }
        if (runtimes.size > 0) {
          await healUserShowRuntimes(db, uid, freshShow.tmdbId, runtimes);
        }
      } catch (err) {
        console.error(`[refreshShow] propagate failed for ${uid} / ${showId}:`, err);
      }
    }),
    5,
  );
}
