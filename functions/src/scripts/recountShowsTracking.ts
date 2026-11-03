/**
 * One-off: recount users/{uid}.stats.showsTracking from the tracking docs — run locally, never
 * deployed. Fixes the drift from removeShow's old second decrement.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npm run recount:showsTracking -- [--dry-run]
 *
 * Safe to rerun: the count is recomputed from scratch.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { recountShowsTracking } from "../hooks/backfill/recountShowsTracking";
import { finishScriptMetrics, startScriptMetrics } from "../hooks/metrics";

async function main() {
  const dryRun = process.argv.slice(2).includes("--dry-run");
  initializeApp();
  startScriptMetrics("recountShowsTracking");
  const rows = await recountShowsTracking(getFirestore(), { dryRun });
  console.table(rows);
  console.log(
    `showsTracking: ${rows.length} users off${dryRun ? " (dry run — nothing written)" : " — fixed"}`,
  );
}

main()
  .then(() => finishScriptMetrics(true))
  .catch(async (err) => {
    console.error(err);
    await finishScriptMetrics(false);
    process.exit(1);
  });
