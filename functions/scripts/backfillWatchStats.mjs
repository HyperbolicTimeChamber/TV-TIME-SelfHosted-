/**
 * Recompute users/{uid}.stats from the watched collections.
 *
 * episodesWatched, moviesWatched and totalMinutes all count every play, so each is the sum of
 * watchCount (and runtime x watchCount) across watchedEpisodes / watchedMovies. They are stored
 * counters, so anything that incremented one side without the other left them adrift — most of
 * all a rewatch, which used to add nothing to episodesWatched while unwatching a play still
 * took one away.
 *
 * showsTracking is deliberately left alone: it counts tracked shows, not plays.
 *
 * Dry run by default — prints what it would change and writes nothing.
 *   node scripts/backfillWatchStats.mjs                  # dry run, every user
 *   node scripts/backfillWatchStats.mjs --uid <uid>      # dry run, one user
 *   node scripts/backfillWatchStats.mjs --apply          # write
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import metrics from "../lib/hooks/metrics.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const uidArg = args[args.indexOf("--uid") + 1];
const onlyUid = args.includes("--uid") ? uidArg : null;

const projectId = process.env.GCLOUD_PROJECT ?? "tv-time-returns";
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
metrics.startScriptMetrics("backfillWatchStats");

/** Sum plays and minutes over one watched subcollection */
async function tally(userRef, name) {
  const snap = await userRef.collection(name).get();
  let plays = 0;
  let minutes = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    const count = typeof d.watchCount === "number" && d.watchCount > 0 ? d.watchCount : 1;
    plays += count;
    minutes += (d.runtime || 0) * count;
  }
  return { plays, minutes, docs: snap.size };
}

const users = onlyUid
  ? [await db.collection("users").doc(onlyUid).get()]
  : (await db.collection("users").get()).docs;

console.log(`${apply ? "APPLY" : "DRY RUN"} · project ${projectId} · ${users.length} user(s)\n`);

let changed = 0;
for (const user of users) {
  if (!user.exists) {
    console.log(`${onlyUid}: no such user`);
    continue;
  }
  const userRef = user.ref;
  const [eps, movies] = await Promise.all([
    tally(userRef, "watchedEpisodes"),
    tally(userRef, "watchedMovies"),
  ]);

  const old = user.data()?.stats ?? {};
  const next = {
    episodesWatched: eps.plays,
    moviesWatched: movies.plays,
    totalMinutes: eps.minutes + movies.minutes,
  };

  const diffs = Object.entries(next).filter(([k, v]) => (old[k] ?? 0) !== v);
  console.log(
    `${user.id}  (${eps.docs} episode docs -> ${eps.plays} plays, ${movies.docs} movie docs -> ${movies.plays} plays)`,
  );
  if (diffs.length === 0) {
    console.log("   already correct\n");
    continue;
  }
  for (const [k, v] of diffs) {
    const was = old[k] ?? 0;
    const delta = v - was;
    console.log(`   ${k}: ${was} -> ${v}  (${delta >= 0 ? "+" : ""}${delta})`);
  }
  console.log("");
  changed++;

  if (apply) await userRef.set({ stats: next }, { merge: true });
}

console.log(
  apply ? `Updated ${changed} user(s).` : `${changed} user(s) would change. Re-run with --apply.`,
);
await metrics.finishScriptMetrics(true);
