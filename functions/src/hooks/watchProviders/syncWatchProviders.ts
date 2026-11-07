import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { pooled } from "../tmdb";
import { parseTmdbId } from "../../shared/docId";
import { WATCH_PROVIDERS_COLLECTION } from "../../shared/enums";
import type {
  RegionWatchProviders,
  WatchProvidersFields,
} from "../../shared/types";
import { fetchTmdbWatchProviders } from "./fetch";
import { normalizeRegion, sameRegionProviders } from "./normalize";

type Doc = FirebaseFirestore.QueryDocumentSnapshot;

/** Refreshes one title's stored countries (one TMDB request); writes only what changed */
async function refreshDoc(
  apiKey: string,
  doc: Doc,
  extra: WatchProvidersFields = {},
): Promise<boolean> {
  const data = doc.data() as WatchProvidersFields;
  const stored = { ...(extra.watchProviders ?? {}), ...(data.watchProviders ?? {}) };
  const regions = [...new Set([...(data.watchRegions ?? []), ...(extra.watchRegions ?? [])])];
  if (regions.length === 0) return false;
  const { tmdbId, mediaType } = parseTmdbId(doc.id);
  const all = await fetchTmdbWatchProviders(apiKey, tmdbId, mediaType);
  const changed: Record<string, RegionWatchProviders> = {};
  for (const region of regions) {
    const fresh = normalizeRegion(all[region]);
    if (!sameRegionProviders(stored[region], fresh)) changed[region] = fresh;
  }
  if (Object.keys(changed).length === 0) return false;
  await doc.ref.set({ watchProviders: changed }, { merge: true });
  return true;
}

/**
 * Weekly (syncCatalog): every title's Where to Watch, for only the countries already stored on it
 * — countries nobody opened the title from are never written. Titles stored outside the catalog
 * that have since been added to it move onto their catalog doc.
 */
export async function syncWatchProviders(db: Firestore, apiKey: string) {
  const [catalog, loose] = await Promise.all([
    db.collection("shows").where("watchRegions", "!=", null).get(),
    db.collection(WATCH_PROVIDERS_COLLECTION).get(),
  ]);
  let updated = 0;
  let moved = 0;

  // A loose doc whose title now has a catalog doc: its countries move there (any the catalog doc
  // already has stay as they are), then it's dropped
  const looseShowRefs = loose.docs.map((d) => db.collection("shows").doc(d.id));
  const looseShows = looseShowRefs.length ? await db.getAll(...looseShowRefs) : [];
  const looseOnly: Doc[] = [];
  const mergeInto = new Map<string, WatchProvidersFields>();
  for (const [i, d] of loose.docs.entries()) {
    const show = looseShows[i];
    if (!show?.exists) {
      looseOnly.push(d);
      continue;
    }
    const fields = d.data() as WatchProvidersFields;
    const has = (show.data() as WatchProvidersFields).watchProviders ?? {};
    const add = Object.fromEntries(
      Object.entries(fields.watchProviders ?? {}).filter(([region]) => !has[region]),
    );
    if (Object.keys(add).length > 0) {
      await show.ref.set(
        { watchProviders: add, watchRegions: FieldValue.arrayUnion(...Object.keys(add)) },
        { merge: true },
      );
    }
    await d.ref.delete();
    mergeInto.set(d.id, fields);
    moved++;
  }

  const tasks = [
    ...catalog.docs.map((d) => () => refreshDoc(apiKey, d, mergeInto.get(d.id))),
    ...looseOnly.map((d) => () => refreshDoc(apiKey, d)),
  ].map((run) => async () => {
    try {
      if (await run()) updated++;
    } catch (err) {
      console.error("[syncWatchProviders] refresh failed:", err);
    }
  });
  await pooled(tasks, 5);
  console.log(
    `Where to Watch: ${catalog.size + looseOnly.length} titles checked, ${updated} updated, ${moved} moved onto catalog docs`,
  );
}
