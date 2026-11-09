/**
 * One-off repair for restaggerBulkMarks.js: a single bulk mark across several seasons used to be
 * sent as one markSeasonWatched call per season, seconds apart, each with its own shared stamp.
 * The restagger grouped by (show, stamp), so it laid each season out separately, every one
 * ending at about the same moment — the seasons ended up on top of each other (a whole-show
 * rewatch showed 181 episodes on one day).
 *
 * This finds those runs — one show's episodes, in season/episode order, each finishing exactly
 * its runtime after the one before (what staggerFinishTimes writes) — joins runs of the same show
 * that end within a few minutes of each other, and lays the joined run end to end, finishing at
 * the latest of their ends. Same layout markSeasonWatched now writes for multi-season marks.
 *
 * Scope: the last 30 days (where the restagger ran).
 *
 *   npm run build && node scripts/chainStaggeredSeasons.js          # dry run
 *   npm run build && node scripts/chainStaggeredSeasons.js --write  # patch Firestore
 */
const admin = require("firebase-admin");
const { scriptProjectId } = require("../lib/hooks/projectEnv");
const { startScriptMetrics, finishScriptMetrics } = require("../lib/hooks/metrics");
const { Timestamp } = require("firebase-admin/firestore");
const {
  FALLBACK_EPISODE_MINUTES,
  staggerFinishTimes,
} = require("../lib/shared/stagger");

const WRITE = process.argv.includes("--write");
const SINCE_DAYS = 30;
/** Runs ending this close together came from one action */
const SAME_ACTION_MS = 5 * 60 * 1000;
const BATCH_LIMIT = 450;

admin.initializeApp({ projectId: scriptProjectId() });
startScriptMetrics("chainStaggeredSeasons");
const db = admin.firestore();

const stepMs = (runtime) =>
  (runtime > 0 ? runtime : FALLBACK_EPISODE_MINUTES) * 60_000;

/** One show's docs → staggered runs (2+ episodes each), in season/episode order */
function staggeredRuns(docs) {
  const eps = docs
    .map((doc) => ({ doc, d: doc.data() }))
    .sort((a, b) => a.d.season - b.d.season || a.d.episode - b.d.episode);
  const runs = [];
  let run = [eps[0]];
  for (let i = 1; i < eps.length; i++) {
    const prev = eps[i - 1].d.lastWatchedAt.toMillis();
    const cur = eps[i].d.lastWatchedAt.toMillis();
    if (cur - prev === stepMs(eps[i].d.runtime)) run.push(eps[i]);
    else {
      if (run.length > 1) runs.push(run);
      run = [eps[i]];
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

const endOf = (run) => run[run.length - 1].d.lastWatchedAt.toMillis();

async function main() {
  const since = Timestamp.fromMillis(
    Date.now() - SINCE_DAYS * 24 * 60 * 60 * 1000,
  );
  const users = await db.collection("users").get();
  let chains = 0;
  let episodes = 0;
  let written = 0;

  for (const user of users.docs) {
    const snap = await db
      .collection(`users/${user.id}/watchedEpisodes`)
      .where("lastWatchedAt", ">=", since)
      .get();
    const byShow = new Map();
    for (const doc of snap.docs) {
      const show = doc.get("tmdbShowId");
      if (!byShow.has(show)) byShow.set(show, []);
      byShow.get(show).push(doc);
    }

    const toChain = [];
    for (const [show, docs] of byShow) {
      const runs = staggeredRuns(docs).sort((a, b) => endOf(a) - endOf(b));
      let group = [];
      for (const run of runs) {
        if (
          group.length &&
          endOf(run) - endOf(group[group.length - 1]) > SAME_ACTION_MS
        ) {
          if (group.length > 1) toChain.push({ show, group });
          group = [];
        }
        group.push(run);
      }
      if (group.length > 1) toChain.push({ show, group });
    }
    if (toChain.length === 0) continue;

    for (const { show, group } of toChain) {
      const n = group.reduce((a, r) => a + r.length, 0);
      chains++;
      episodes += n;
      console.log(
        `${user.id.slice(0, 8)}…  show ${show}: ${group.length} runs → one chain of ${n} episodes`,
      );
    }
    if (!WRITE) continue;

    let batch = db.batch();
    let pending = 0;
    for (const { group } of toChain) {
      // Oldest season first, ending at the latest of the runs' ends
      const ordered = group
        .slice()
        .sort(
          (a, b) =>
            a[0].d.season - b[0].d.season || a[0].d.episode - b[0].d.episode,
        )
        .flat();
      const end = Math.max(...group.map(endOf));
      const times = staggerFinishTimes(
        ordered.map(({ d }) => d.runtime),
        end,
      );
      for (let i = 0; i < ordered.length; i++) {
        const { doc, d } = ordered[i];
        const at = Timestamp.fromMillis(times[i]);
        const update = { lastWatchedAt: at };
        if (d.watchedAt && d.watchedAt.isEqual(d.lastWatchedAt))
          update.watchedAt = at;
        batch.update(doc.ref, update);
        if (++pending >= BATCH_LIMIT) {
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
    `${chains} chains, ${episodes} episodes` +
      (WRITE
        ? ` — ${written} docs re-laid`
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
