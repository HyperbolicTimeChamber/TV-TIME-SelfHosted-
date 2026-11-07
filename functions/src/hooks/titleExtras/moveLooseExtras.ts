import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { TITLE_EXTRAS_COLLECTION } from "../../shared/enums";
import type { TitleExtrasFields } from "../../shared/types";

/**
 * Weekly, before the refreshes: titleExtras/ docs whose title has since got a catalog doc (it was
 * tracked) move onto it — every field the catalog doc doesn't have yet (its own stay) — and are
 * deleted, so each title's extras live in one place
 */
export async function moveLooseExtras(db: Firestore) {
  const loose = await db.collection(TITLE_EXTRAS_COLLECTION).get();
  if (loose.empty) return;
  const shows = await db.getAll(...loose.docs.map((d) => db.collection("shows").doc(d.id)));
  let moved = 0;
  for (const [i, d] of loose.docs.entries()) {
    const show = shows[i];
    if (!show?.exists) continue;
    const from = d.data() as TitleExtrasFields;
    const has = show.data() as TitleExtrasFields;
    const add: Record<string, unknown> = {};
    for (const key of ["cast", "castTotal", "directors", "writers", "studioLogos", "creditsUpdatedAt"] as const) {
      if (from[key] !== undefined && has[key] === undefined) add[key] = from[key];
    }
    const regions = Object.entries(from.watchProviders ?? {}).filter(
      ([region]) => !has.watchProviders?.[region],
    );
    if (regions.length > 0) {
      add.watchProviders = Object.fromEntries(regions);
      add.watchRegions = FieldValue.arrayUnion(...regions.map(([r]) => r));
    }
    if (Object.keys(add).length > 0) await show.ref.set(add, { merge: true });
    await d.ref.delete();
    moved++;
  }
  console.log(`Info page extras: ${moved} loose docs moved onto catalog docs`);
}
