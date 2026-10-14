import { pooled } from "../tmdb";

interface Watched {
  runtime?: number;
  watchCount?: number;
}

/** Watch Time totals from source docs: first watch only vs every watch (rewatches) */
export function watchTimeTotals(episodes: Watched[], movies: Watched[]) {
  const sum = (docs: Watched[], everyWatch: boolean) =>
    docs.reduce(
      (s, d) => s + (d.runtime ?? 0) * (everyWatch ? (d.watchCount ?? 1) : 1),
      0,
    );
  return {
    firstWatch: sum(episodes, false) + sum(movies, false),
    everyWatch: sum(episodes, true) + sum(movies, true),
  };
}

export type WatchTimeMode = "firstWatch" | "everyWatch";

/**
 * users/{uid}.stats.totalMinutes recomputed from watchedEpisodes + watchedMovies
 * (movie marks used to add runtime / 60). Returns per-user before/after for review.
 */
export async function recountWatchTime(
  db: FirebaseFirestore.Firestore,
  { dryRun, mode }: { dryRun: boolean; mode: WatchTimeMode },
) {
  const users = await db.collection("users").listDocuments();
  const writer = db.bulkWriter();
  const rows: Array<{ uid: string; before: number; firstWatch: number; everyWatch: number }> = [];

  await pooled(
    users.map((user) => async () => {
      const [profile, eps, movies] = await Promise.all([
        user.get(),
        user.collection("watchedEpisodes").get(),
        user.collection("watchedMovies").get(),
      ]);
      const totals = watchTimeTotals(
        eps.docs.map((d) => d.data()),
        movies.docs.map((d) => d.data()),
      );
      const before = profile.data()?.stats?.totalMinutes ?? 0;
      rows.push({ uid: user.id, before, ...totals });
      if (!dryRun && totals[mode] !== before) {
        writer.set(
          user,
          { stats: { totalMinutes: totals[mode] } },
          { merge: true },
        );
      }
    }),
    5,
  );
  await writer.close();
  return rows;
}
