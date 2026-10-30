import { pooled } from "./tmdb";
import { GRPC_ALREADY_EXISTS, WRITE_BATCH_SIZE } from "../shared/enums";

export interface DocWrite {
  ref: FirebaseFirestore.DocumentReference;
  data: FirebaseFirestore.DocumentData;
  merge?: boolean;
}

/**
 * create()s each doc, skipping ones that already exist (no reads, nothing overwritten).
 * Resolves with the writes that landed; throws if any failed for another reason.
 */
export async function createMissing(
  db: FirebaseFirestore.Firestore,
  writes: DocWrite[],
): Promise<DocWrite[]> {
  const writer = db.bulkWriter({ throttling: false });
  const created: DocWrite[] = [];
  let failed = 0;
  const settled = writes.map((w) =>
    writer.create(w.ref, w.data).then(
      () => {
        created.push(w);
      },
      (e: FirebaseFirestore.BulkWriterError) => {
        if (e.code !== GRPC_ALREADY_EXISTS) failed++;
      },
    ),
  );
  await writer.close();
  await Promise.all(settled);
  if (failed) throw new Error(`${failed} history writes failed`);
  return created;
}

/** Commits set() writes as full WriteBatches, `concurrency` commits in flight */
export async function commitInBatches(
  db: FirebaseFirestore.Firestore,
  writes: DocWrite[],
  concurrency = 10,
): Promise<void> {
  const tasks: Array<() => Promise<void>> = [];
  for (let i = 0; i < writes.length; i += WRITE_BATCH_SIZE) {
    const chunk = writes.slice(i, i + WRITE_BATCH_SIZE);
    tasks.push(async () => {
      const batch = db.batch();
      for (const w of chunk) {
        if (w.merge) batch.set(w.ref, w.data, { merge: true });
        else batch.set(w.ref, w.data);
      }
      await batch.commit();
    });
  }
  await pooled(tasks, concurrency);
}
