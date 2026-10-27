import { FieldValue } from "firebase-admin/firestore";
import { CatalogShow } from "../../shared/types";
import { MediaType } from "../../shared/enums";
import { showDocId } from "../../shared/docId";
import { historyOnChange } from "../../shared/history";

const key = (season: number, episode: number) => `${season}_${episode}`;

/** Episode runtimes a catalog knows, by "season_episode" */
export function catalogRuntimes(show: Pick<CatalogShow, "seasons">): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of show.seasons ?? []) {
    for (const e of s.episodes ?? []) {
      if (e.runtime && e.runtime > 0) out.set(key(s.seasonNumber, e.episodeNumber), e.runtime);
    }
  }
  return out;
}

/** Episodes TMDB gave a runtime this sync that it didn't have before */
export function filledRuntimes(
  oldShow: Pick<CatalogShow, "seasons">,
  freshShow: Pick<CatalogShow, "seasons">,
): Map<string, number> {
  const before = catalogRuntimes(oldShow);
  const filled = new Map<string, number>();
  for (const [k, runtime] of catalogRuntimes(freshShow)) {
    if (!before.has(k)) filled.set(k, runtime);
  }
  return filled;
}

interface WatchedEp {
  season: number;
  episode: number;
  watchCount?: number;
}

/** Minutes a set of 0-runtime watched episodes gains once runtimes are known (rewatches count) */
export function healedMinutes(
  episodes: WatchedEp[],
  runtimes: Map<string, number>,
): { minutes: number; healed: Array<WatchedEp & { runtime: number }> } {
  let minutes = 0;
  const healed: Array<WatchedEp & { runtime: number }> = [];
  for (const ep of episodes) {
    const runtime = runtimes.get(key(ep.season, ep.episode));
    if (!runtime) continue;
    minutes += runtime * (ep.watchCount ?? 1);
    healed.push({ ...ep, runtime });
  }
  return { minutes, healed };
}

/**
 * One user × one show: watched episodes stored with runtime 0 get the runtime TMDB now
 * has; the show's Watch History minutes and the profile Watch Time catch up.
 * Reads only that user's 0-runtime docs for the show.
 */
export async function healUserShowRuntimes(
  db: FirebaseFirestore.Firestore,
  uid: string,
  tmdbId: number,
  runtimes: Map<string, number>,
  { dryRun = false } = {},
): Promise<number> {
  const snap = await db
    .collection(`users/${uid}/watchedEpisodes`)
    .where("tmdbShowId", "==", tmdbId)
    .where("runtime", "==", 0)
    .get();
  const docs = snap.docs.map((d) => ({ ref: d.ref, ...(d.data() as WatchedEp) }));
  const { minutes, healed } = healedMinutes(docs, runtimes);
  if (healed.length === 0 || dryRun) return minutes;

  const batch = db.batch();
  for (const ep of healed as Array<(typeof docs)[number] & { runtime: number }>) {
    batch.update(ep.ref, { runtime: ep.runtime });
  }
  batch.set(
    db.doc(`users/${uid}/tracking/${showDocId(tmdbId, MediaType.TV)}`),
    { minutesWatched: FieldValue.increment(minutes), ...historyOnChange() },
    { merge: true },
  );
  batch.set(
    db.doc(`users/${uid}`),
    { stats: { totalMinutes: FieldValue.increment(minutes) } },
    { merge: true },
  );
  await batch.commit();
  return minutes;
}
