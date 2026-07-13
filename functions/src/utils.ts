import { getFirestore, FieldValue } from "firebase-admin/firestore";

const TRACKED_BY_LIMIT = 1000;

export async function addToTrackedBy(
  showId: string,
  uid: string
): Promise<void> {
  const db = getFirestore();
  const showRef = db.doc(`shows/${showId}`);

  await db.runTransaction(async (tx) => {
    const showDoc = await tx.get(showRef);
    if (!showDoc.exists) return;

    const trackedBy: string[] = showDoc.data()?.trackedBy ?? [];
    if (trackedBy.includes(uid)) return;

    if (trackedBy.length < TRACKED_BY_LIMIT) {
      tx.update(showRef, {
        trackedBy: FieldValue.arrayUnion(uid),
        trackedByCount: FieldValue.increment(1),
      });
    } else {
      // Overflow: find or create overflow chunk
      const overflowSnap = await tx.get(
        showRef.collection("trackedByOverflow")
      );
      let placed = false;
      for (const chunk of overflowSnap.docs) {
        const uids: string[] = chunk.data().uids ?? [];
        if (uids.length < TRACKED_BY_LIMIT && !uids.includes(uid)) {
          tx.update(chunk.ref, { uids: FieldValue.arrayUnion(uid) });
          tx.update(showRef, { trackedByCount: FieldValue.increment(1) });
          placed = true;
          break;
        }
      }
      if (!placed) {
        const newChunkRef = showRef
          .collection("trackedByOverflow")
          .doc();
        tx.set(newChunkRef, { uids: [uid] });
        tx.update(showRef, { trackedByCount: FieldValue.increment(1) });
      }
    }
  });
}

export async function removeFromTrackedBy(
  showId: string,
  uid: string
): Promise<number> {
  const db = getFirestore();
  const showRef = db.doc(`shows/${showId}`);

  return db.runTransaction(async (tx) => {
    const showDoc = await tx.get(showRef);
    if (!showDoc.exists) return 0;

    const trackedBy: string[] = showDoc.data()?.trackedBy ?? [];
    const currentCount: number = showDoc.data()?.trackedByCount ?? 0;

    if (trackedBy.includes(uid)) {
      tx.update(showRef, {
        trackedBy: FieldValue.arrayRemove(uid),
        trackedByCount: FieldValue.increment(-1),
      });
      return currentCount - 1;
    }

    // Check overflow chunks
    const overflowSnap = await tx.get(
      showRef.collection("trackedByOverflow")
    );
    for (const chunk of overflowSnap.docs) {
      const uids: string[] = chunk.data().uids ?? [];
      if (uids.includes(uid)) {
        tx.update(chunk.ref, { uids: FieldValue.arrayRemove(uid) });
        tx.update(showRef, { trackedByCount: FieldValue.increment(-1) });
        return currentCount - 1;
      }
    }

    return currentCount;
  });
}

export async function getAllTrackerUids(
  showId: string
): Promise<string[]> {
  const db = getFirestore();
  const showRef = db.doc(`shows/${showId}`);
  const showDoc = await showRef.get();
  if (!showDoc.exists) return [];

  const trackedBy: string[] = showDoc.data()?.trackedBy ?? [];

  const overflowSnap = await showRef
    .collection("trackedByOverflow")
    .get();
  for (const chunk of overflowSnap.docs) {
    trackedBy.push(...(chunk.data().uids ?? []));
  }

  return trackedBy;
}
