/**
 * One-off: stamp `airDates14` on every catalog doc (new docs get it from addShow / syncCatalog).
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npm run build && node lib/scripts/backfillAirDates.js [--dry-run]
 *
 * Safe to rerun: only docs whose stamp differs are written.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { finishScriptMetrics, startScriptMetrics } from "../hooks/metrics";
import { airDates14 } from "../shared/airDates";
import type { CatalogShow } from "../shared/types";

const BATCH = 400;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  initializeApp();
  startScriptMetrics("backfillAirDates");
  const db = getFirestore();
  const snap = await db.collection("shows").get();
  const writes: Array<{ ref: FirebaseFirestore.DocumentReference; dates: string[] }> = [];
  for (const d of snap.docs) {
    const dates = airDates14(d.data() as CatalogShow);
    const old = d.get("airDates14") as string[] | undefined;
    if (old && JSON.stringify(old) === JSON.stringify(dates)) continue;
    writes.push({ ref: d.ref, dates });
  }
  console.log(`${snap.size} catalog docs, ${writes.length} to stamp${dryRun ? " (dry run — nothing written)" : ""}`);
  if (!dryRun) {
    for (let i = 0; i < writes.length; i += BATCH) {
      const batch = db.batch();
      for (const w of writes.slice(i, i + BATCH)) batch.set(w.ref, { airDates14: w.dates }, { merge: true });
      await batch.commit();
    }
  }
  await finishScriptMetrics(true);
}

main().catch(async (err) => {
  console.error(err);
  await finishScriptMetrics(false);
  process.exit(1);
});
