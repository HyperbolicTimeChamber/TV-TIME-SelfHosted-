import { CatalogShow } from "../../shared/types";
import { ENDED_STATUSES, MediaType } from "../../shared/enums";
import { applyAirStamps, fetchTvmazeAirStamps, lookupTvmazeId, needsAirStamps } from "../tvmaze";
import { rebuildAllUsersUpcoming } from "../upcoming/rebuildUpcoming";
import axios from "axios";
import { TMDB_BASE } from "../../shared/enums";

/**
 * One-off: TVMaze air times for catalog shows still airing with recent/upcoming
 * episodes (the weekly sync keeps them fresh afterwards), then rebuild every user's
 * upcoming docs so they carry airStamp too. TVMaze calls are rate-limited (~2/s).
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
      applyAirStamps(show.seasons, await fetchTvmazeAirStamps(tvmazeId));
      stamped += show.seasons.reduce((n, s) => n + s.episodes.filter((e) => e.airStamp).length, 0);
      if (!dryRun) await d.ref.update({ seasons: show.seasons, tvmazeId });
    } catch (err) {
      console.warn(`${show.title}: ${(err as Error).message}`);
    }
  }

  if (!dryRun) await rebuildAllUsersUpcoming(db, catalogMap, true);
  return { candidates, matched, stamped };
}
