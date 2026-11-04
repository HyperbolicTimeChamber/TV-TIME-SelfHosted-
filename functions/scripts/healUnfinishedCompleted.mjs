/**
 * TV shows marked "completed" while an aired episode is still ahead of the pointer (TV Time
 * imports brought archived / dropped shows in as completed after 2 of 16 episodes) → watching.
 * The weekly rebuildUpcoming reconcile does the same; this applies it now.
 *
 * Reads: each user's completed TV tracking docs + their catalog docs (in batches of 30).
 * Writes go through commitInBatches (stamps updatedAt for the tracking delta sync).
 *
 * Dry run by default — prints what it would change and writes nothing. Build first (npm run build).
 *   node scripts/healUnfinishedCompleted.mjs --uid <uid>      # dry run, one user
 *   node scripts/healUnfinishedCompleted.mjs                  # dry run, every user
 *   node scripts/healUnfinishedCompleted.mjs --uid <uid> --apply
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";
import metrics from "../lib/hooks/metrics.js";
import projectEnv from "../lib/hooks/projectEnv.js";
import completedStatus from "../lib/hooks/completedStatus.js";
import batchWrites from "../lib/hooks/batchWrites.js";
import history from "../lib/shared/history.js";
import enums from "../lib/shared/enums.js";

const { WatchStatus, MediaType } = enums;
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const onlyUid = args.includes("--uid") ? args[args.indexOf("--uid") + 1] : null;

const projectId = projectEnv.scriptProjectId();
initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();
metrics.startScriptMetrics("healUnfinishedCompleted");

const today = new Date().toISOString().slice(0, 10);
const uids = onlyUid
  ? [onlyUid]
  : (await db.collection("users").select().get()).docs.map((d) => d.id);

console.log(`${apply ? "APPLY" : "DRY RUN"} · project ${projectId} · ${uids.length} user(s)\n`);

let total = 0;
for (const uid of uids) {
  const snap = await db
    .collection(`users/${uid}/tracking`)
    .where("mediaType", "==", MediaType.TV)
    .where("status", "==", WatchStatus.COMPLETED)
    .get();
  const withPointer = snap.docs.filter((d) => d.data().nextEpisode);
  if (withPointer.length === 0) continue;

  const catalogs = new Map();
  for (let i = 0; i < withPointer.length; i += 30) {
    const ids = withPointer.slice(i, i + 30).map((d) => d.id);
    const cs = await db.collection("shows").where(FieldPath.documentId(), "in", ids).get();
    for (const c of cs.docs) catalogs.set(c.id, c.data());
  }

  const writes = [];
  for (const d of withPointer) {
    const data = d.data();
    const catalog = catalogs.get(d.id);
    if (!completedStatus.isUnfinishedCompleted(data.status, data.nextEpisode, catalog, today))
      continue;
    const n = data.nextEpisode;
    console.log(`  ${uid}  ${d.id}  ${catalog?.title ?? "?"}  next S${n.season}E${n.episode}`);
    writes.push({
      ref: d.ref,
      data: { status: WatchStatus.WATCHING, ...history.historyOnChange() },
      merge: true,
    });
  }
  total += writes.length;
  if (apply && writes.length > 0) await batchWrites.commitInBatches(db, writes);
}

console.log(
  apply ? `\nUpdated ${total} show(s).` : `\n${total} show(s) would change. Re-run with --apply.`,
);
await metrics.finishScriptMetrics(true);
