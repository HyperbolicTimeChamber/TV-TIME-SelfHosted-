/**
 * One-off: spread out bulk marks written before markSeasonWatched staggered them.
 *
 * A bulk mark (a season, a Woah There Speedster catch-up, a rewatch range) used to stamp every
 * episode with one shared lastWatchedAt, piling the whole catch-up onto one day in the watch
 * rate charts. This lays each such run back to back, the last episode keeping the original
 * time — the same layout markSeasonWatched now writes (lib/shared/stagger).
 *
 * A run is one show's episodes sharing a stamp; different shows are staggered independently and
 * may overlap. watchedAt moves too when it was that same stamp (the doc was created by the bulk
 * mark), so the first watch never lands after the latest.
 *
 * Scope: stamps from the last 30 days by default (the charts show 7), so imported history from
 * long ago is left alone; --all for everything.
 *
 *   npm run build && node scripts/restaggerBulkMarks.js                 # dry run (counts only)
 *   npm run build && node scripts/restaggerBulkMarks.js --write         # patch Firestore
 *   npm run build && node scripts/restaggerBulkMarks.js --all [--write] # every stamp
 *
 * Auth: gcloud application-default credentials (project tv-time-returns).
 */
const admin = require("firebase-admin");
const { startScriptMetrics, finishScriptMetrics } = require("../lib/hooks/metrics");
const { Timestamp } = require("firebase-admin/firestore");
const { staggerFinishTimes } = require("../lib/shared/stagger");

const WRITE = process.argv.includes("--write");
const ALL = process.argv.includes("--all");
const SINCE_DAYS = 30;
// Firestore batches hold at most 500 writes
const BATCH_LIMIT = 450;

admin.initializeApp({ projectId: "tv-time-returns" });
startScriptMetrics("restaggerBulkMarks");
const db = admin.firestore();

const stampKey = (t) => `${t.seconds}.${t.nanoseconds}`;

async function main() {
  const since = Timestamp.fromMillis(
    Date.now() - SINCE_DAYS * 24 * 60 * 60 * 1000,
  );
  const users = await db.collection("users").get();
  let runs = 0;
  let episodes = 0;
  let written = 0;

  for (const user of users.docs) {
    let q = db.collection(`users/${user.id}/watchedEpisodes`);
    if (!ALL) q = q.where("lastWatchedAt", ">=", since);
    const snap = await q.get();

    // One show's episodes sharing a stamp = one bulk run
    const groups = new Map();
    for (const doc of snap.docs) {
      const d = doc.data();
      if (!d.lastWatchedAt) continue;
      const key = `${d.tmdbShowId}|${stampKey(d.lastWatchedAt)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(doc);
    }
    const bulk = [...groups.values()].filter((g) => g.length > 1);
    if (bulk.length === 0) continue;

    const sizes = bulk.map((g) => g.length);
    runs += bulk.length;
    episodes += sizes.reduce((a, b) => a + b, 0);
    console.log(
      `${user.id.slice(0, 8)}…  ${bulk.length} runs  (${sizes.join(", ")} episodes)`,
    );
    if (!WRITE) continue;

    let batch = db.batch();
    let pending = 0;
    for (const group of bulk) {
      const ordered = group
        .map((doc) => ({ doc, d: doc.data() }))
        .sort((a, b) => a.d.season - b.d.season || a.d.episode - b.d.episode);
      const stamp = ordered[0].d.lastWatchedAt;
      const times = staggerFinishTimes(
        ordered.map(({ d }) => d.runtime),
        stamp.toMillis(),
      );
      for (let i = 0; i < ordered.length; i++) {
        const { doc, d } = ordered[i];
        const at = Timestamp.fromMillis(times[i]);
        const update = { lastWatchedAt: at };
        if (d.watchedAt && stampKey(d.watchedAt) === stampKey(stamp))
          update.watchedAt = at;
        batch.update(doc.ref, update);
        pending++;
        if (pending >= BATCH_LIMIT) {
          await batch.commit();
          written += pending;
          batch = db.batch();
          pending = 0;
        }
      }
    }
    if (pending > 0) {
      await batch.commit();
      written += pending;
    }
  }

  console.log(
    `${runs} bulk runs, ${episodes} episodes${ALL ? "" : ` (last ${SINCE_DAYS} days)`}` +
      (WRITE
        ? ` — ${written} docs restaggered`
        : " — dry run, re-run with --write"),
  );
}

main()
  .then(() => finishScriptMetrics(true))
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error(err);
    await finishScriptMetrics(false);
    process.exit(1);
  });
