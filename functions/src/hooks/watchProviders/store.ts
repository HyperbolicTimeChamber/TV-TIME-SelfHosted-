import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { TITLE_EXTRAS_COLLECTION } from "../../shared/enums";
import type {
  RegionWatchProviders,
  WatchProvidersFields,
} from "../../shared/types";

/**
 * Where a title's Where to Watch data lives: its catalog doc when it has one (the info page reads
 * that anyway), else its titleExtras/ doc. One read; the catalog doc is checked first
 */
export async function readStoredProviders(db: Firestore, docId: string) {
  const showRef = db.collection("shows").doc(docId);
  const show = await showRef.get();
  if (show.exists) {
    return { ref: showRef, data: show.data() as WatchProvidersFields };
  }
  const ref = db.collection(TITLE_EXTRAS_COLLECTION).doc(docId);
  const doc = await ref.get();
  return { ref, data: (doc.data() ?? {}) as WatchProvidersFields };
}

/** Stores one country's services (an empty list too) and adds the country to watchRegions */
export async function writeRegionProviders(
  ref: FirebaseFirestore.DocumentReference,
  region: string,
  value: RegionWatchProviders,
) {
  await ref.set(
    {
      watchProviders: { [region]: value },
      watchRegions: FieldValue.arrayUnion(region),
    },
    { merge: true },
  );
}
