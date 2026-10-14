/**
 * One-off admin backfill for Watch History — run locally, never deployed.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npm run backfill:history -- [--dry-run] [--only=history|logos]
 *
 * Safe to rerun: history totals are recomputed from scratch, logos only fill gaps.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getTmdbApiKey } from "../hooks/apiKey";
import { backfillHistory, backfillLogos } from "../hooks/backfill/runBackfill";

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
