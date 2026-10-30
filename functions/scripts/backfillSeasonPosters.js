/**
 * One-off: add each season's own poster (posterPath) to catalog docs written before it was
 * stored. Without it the show page gives every season the show's poster. Ended / canceled
 * shows never get it from syncCatalog (it only refreshes their status), so they need this.
 *
 * One TMDB call per show (/tv/{id} lists every season's poster). Only posterPath is added to
 * the stored seasons — nothing else in the doc changes. Changed docs get refreshedSinceSync,
 * so clients re-read them after the next sync.
 *
 *   npm run build && node scripts/backfillSeasonPosters.js          # dry run (counts only)
 *   npm run build && node scripts/backfillSeasonPosters.js --write  # patch Firestore
 *
 * Auth: gcloud application-default credentials (project tv-time-returns).
 */
const admin = require("firebase-admin");
const { startScriptMetrics, finishScriptMetrics } = require("../lib/hooks/metrics");
const axios = require("axios");
const { MediaType, TMDB_BASE } = require("../lib/shared/enums");

const WRITE = process.argv.includes("--write");
// TMDB allows ~40 req/s; stay well under it
const CONCURRENCY = 4;

admin.initializeApp({ projectId: "tv-time-returns" });
startScriptMetrics("backfillSeasonPosters");
const db = admin.firestore();

async function pooled(items, limit, fn) {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) await fn(items[next++]);
    },
  );
  await Promise.all(workers);
}

// Missing, not null: null means TMDB had no poster for that season when it was checked
const needsBackfill = (show) =>
  show.mediaType === MediaType.TV &&
  (show.seasons ?? []).some((s) => s.posterPath === undefined);

async function main() {
  const apiKey = (await db.doc("config/app").get()).get("tmdbApiKey");
  if (!apiKey) throw new Error("config/app.tmdbApiKey missing");

  const snap = await db.collection("shows").get();
  const todo = snap.docs.filter((d) => needsBackfill(d.data()));
  console.log(
    `${snap.size} catalog docs, ${todo.length} TV docs missing season posters`,
  );
  if (!WRITE) {
    console.log(
      `dry run — would fetch ${todo.length} shows from TMDB. Re-run with --write`,
    );
    return;
  }

  let patched = 0;
  let posters = 0;
  let failed = 0;
  await pooled(todo, CONCURRENCY, async (docSnap) => {
    const show = docSnap.data();
    try {
      const { data } = await axios.get(`${TMDB_BASE}/tv/${show.tmdbId}`, {
        params: { api_key: apiKey },
      });
      const byNumber = new Map(
        (data.seasons ?? []).map((s) => [
          s.season_number,
          s.poster_path ?? null,
        ]),
      );
      const seasons = (show.seasons ?? []).map((season) => {
        const posterPath = byNumber.get(season.seasonNumber) ?? null;
        if (posterPath) posters++;
        return { ...season, posterPath };
      });
      await docSnap.ref.update({ seasons, refreshedSinceSync: true });
      patched++;
    } catch (err) {
      failed++;
      console.warn(`${docSnap.id}: ${err.response?.status ?? err.message}`);
    }
    if ((patched + failed) % 50 === 0)
      console.log(`… ${patched + failed}/${todo.length}`);
  });
  console.log(
    `patched ${patched}, failed ${failed}, season posters found ${posters}`,
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
