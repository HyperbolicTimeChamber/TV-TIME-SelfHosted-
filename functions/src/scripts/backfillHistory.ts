/**
 * One-off admin backfill for Watch History — run locally, never deployed.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npm run backfill:history -- [--dry-run] [--only=history|logos|stats|ended|runtimes] [--mode=firstWatch|everyWatch]
 *
 * stats (only when asked for): recompute profile Watch Time from watched docs.
 *
 * Safe to rerun: history totals are recomputed from scratch, logos only fill gaps.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getTmdbApiKey } from "../hooks/apiKey";
import { backfillHistory, backfillLogos } from "../hooks/backfill/runBackfill";
import { recountWatchTime, WatchTimeMode } from "../hooks/backfill/recountWatchTime";
import { completeEndedShows } from "../hooks/backfill/completeEndedShows";
import { healZeroRuntimes } from "../hooks/backfill/healZeroRuntimes";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const only = args.find((a) => a.startsWith("--only="))?.split("=")[1];

  initializeApp();
  const db = getFirestore();
  console.log(`Watch History backfill${dryRun ? " (dry run — no writes)" : ""}`);

  if (!only || only === "history") {
    const r = await backfillHistory(db, { dryRun });
    console.log(`History: ${r.users} users, ${r.docsWritten} tracking docs updated`);
  }
  if (only === "stats") {
    const mode = (args.find((a) => a.startsWith("--mode="))?.split("=")[1] ??
      "firstWatch") as WatchTimeMode;
    const rows = await recountWatchTime(db, { dryRun, mode });
    console.table(rows);
    console.log(`Watch Time recount (${mode})${dryRun ? " — dry run, nothing written" : " written"}`);
  }
  if (only === "runtimes") {
    const rows = await healZeroRuntimes(db, { dryRun });
    console.table(rows);
    console.log(`0-minute episodes healed${dryRun ? " (dry run — nothing written)" : ""}`);
  }
  if (only === "ended") {
    const r = await completeEndedShows(db, { dryRun });
    console.table(r.changed);
    console.log(`Ended shows: ${r.endedShows}; ${r.changed.length} tracking docs ${dryRun ? "would be" : ""} marked completed`);
  }
  if (!only || only === "logos") {
    const r = await backfillLogos(db, await getTmdbApiKey(), { dryRun });
    console.log(
      `Logos: ${r.shows} shows, ${r.checked} checked, ${r.found} with a logo, ${r.failed} failed (rerun to retry)`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
