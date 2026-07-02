import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

interface CacheEntry {
  data: unknown;
  lastUpdated: admin.firestore.Timestamp;
}

export async function getCached(
  collection: string,
  docId: string,
  ttlMs: number
): Promise<unknown | null> {
  const doc = await db.collection(collection).doc(docId).get();
  if (!doc.exists) return null;

  const entry = doc.data() as CacheEntry;
  const age = Date.now() - entry.lastUpdated.toMillis();
  if (age > ttlMs) return null;

  return entry.data;
}

export async function setCache(
  collection: string,
  docId: string,
  data: unknown
): Promise<void> {
  await db
    .collection(collection)
    .doc(docId)
    .set({
      data,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    });
}

export { db };
