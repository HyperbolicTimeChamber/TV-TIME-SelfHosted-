import { pooled } from "./tmdb";
import { WRITE_BATCH_SIZE } from "../shared/enums";

export interface DocWrite {
  ref: FirebaseFirestore.DocumentReference;
  data: FirebaseFirestore.DocumentData;
  merge?: boolean;
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
