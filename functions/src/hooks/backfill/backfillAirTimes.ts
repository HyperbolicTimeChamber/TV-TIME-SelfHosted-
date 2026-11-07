import { CatalogShow } from "../../shared/types";
import { ENDED_STATUSES, MediaType } from "../../shared/enums";
import { applyAirStamps, fetchTvmazeAirStamps, lookupTvmazeId, needsAirStamps } from "../tvmaze";
import { rebuildUserUpcoming } from "../upcoming/rebuildUpcoming";
import axios from "axios";
import { TMDB_BASE } from "../../shared/enums";

/**
 * One-off: TVMaze air times for catalog shows still airing with recent/upcoming
 * episodes (the weekly sync keeps them fresh afterwards). Only shows whose stamps changed are
 * written, and only their trackers' upcoming docs are rebuilt (they carry airStamp too).
 * TVMaze calls are rate-limited (~2/s).
 */
export async function backfillAirTimes(
  db: FirebaseFirestore.Firestore,
  apiKey: string,
  { dryRun }: { dryRun: boolean },
) {
  const snap = await db.collection("shows").where("mediaType", "==", MediaType.TV).get();
  const catalogMap = new Map<string, CatalogShow>();
  let candidates = 0;
  let matched = 0;
  let stamped = 0;
  let changed = 0;
  // Trackers of shows whose stamps changed → their upcoming docs are rebuilt
  const affectedUids = new Set<string>();

  for (const d of snap.docs) {
    const show = d.data() as CatalogShow;
    catalogMap.set(d.id, show);
    if (!needsAirStamps(show.seasons ?? [], ENDED_STATUSES.includes(show.status))) continue;
    candidates++;
    try {
      let tvmazeId = show.tvmazeId ?? null;
      if (!tvmazeId) {
        const { data } = await axios.get<{ tvdb_id?: number | null; imdb_id?: string | null }>(
          `${TMDB_BASE}/tv/${show.tmdbId}/external_ids`,
          { params: { api_key: apiKey } },
        );
        tvmazeId = await lookupTvmazeId(data);
      }
      if (!tvmazeId) continue;
      matched++;
      const before = JSON.stringify(show.seasons);
      applyAirStamps(show.seasons, await fetchTvmazeAirStamps(tvmazeId));
      stamped += show.seasons.reduce((n, s) => n + s.episodes.filter((e) => e.airStamp).length, 0);
      if (JSON.stringify(show.seasons) === before && show.tvmazeId === tvmazeId) continue;
      changed++;
      for (const uid of (d.data().trackedBy as string[] | undefined) ?? []) affectedUids.add(uid);
      if ((d.data().trackedByCount ?? 0) > ((d.data().trackedBy as string[] | undefined)?.length ?? 0)) {
        const overflow = await d.ref.collection("trackedByOverflow").get();
        for (const chunk of overflow.docs) for (const uid of chunk.data().uids ?? []) affectedUids.add(uid);
      }
      if (!dryRun) await d.ref.update({ seasons: show.seasons, tvmazeId });
    } catch (err) {
      console.warn(`${show.title}: ${(err as Error).message}`);
    }
  }

  if (!dryRun) {
    for (const uid of affectedUids) {
      try {
        await rebuildUserUpcoming(db, uid, catalogMap);
      } catch (err) {
        console.error(`Failed to rebuild upcoming for user ${uid}:`, err);
      }
    }
  }
  return { candidates, matched, stamped, changed, usersRebuilt: affectedUids.size };
}
