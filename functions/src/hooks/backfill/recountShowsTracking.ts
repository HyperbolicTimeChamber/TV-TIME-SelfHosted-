import { pooled } from "../tmdb";

/**
 * users/{uid}.stats.showsTracking recounted from the tracking docs (count queries: 1 read per
 * 1,000 docs). removeShow used to take one off after the client already had, so the counter
 * drifted low by one per removal. Returns per-user before/after for review.
 */
export async function recountShowsTracking(
  db: FirebaseFirestore.Firestore,
  { dryRun }: { dryRun: boolean },
) {
  const users = await db.collection("users").listDocuments();
  const writer = db.bulkWriter();
  const rows: Array<{ uid: string; before: number; after: number }> = [];

  await pooled(
    users.map((user) => async () => {
      const [profile, count] = await Promise.all([
        user.get(),
        user.collection("tracking").count().get(),
      ]);
      if (!profile.exists) return;
      const before = Number(profile.data()?.stats?.showsTracking ?? 0);
      const after = count.data().count;
      if (before === after) return;
      rows.push({ uid: user.id, before, after });
      if (!dryRun) writer.set(user, { stats: { showsTracking: after } }, { merge: true });
    }),
    10,
  );
  await writer.close();
  return rows;
}
