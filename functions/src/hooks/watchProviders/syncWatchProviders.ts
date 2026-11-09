import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { pooled } from "../tmdb";
import { parseTmdbId } from "../../shared/docId";
import {
  LEGACY_WATCH_PROVIDERS_COLLECTION,
  MediaType,
  TITLE_EXTRAS_COLLECTION,
} from "../../shared/enums";
import type {
  RegionWatchProviders,
  TitleExtrasFields,
  WatchProvidersFields,
} from "../../shared/types";
import { fetchTitleBundle } from "../titleExtras/fetch";
import { localReleaseDate } from "../titleExtras/normalize";
import { fetchTmdbWatchProviders } from "./fetch";
import { normalizeRegion, sameRegionProviders } from "./normalize";

type Doc = FirebaseFirestore.QueryDocumentSnapshot;

/** Refreshes one title's stored countries, a movie's release dates too (one TMDB request); writes
 *  only what changed */
async function refreshDoc(
  apiKey: string,
  doc: Doc,
  extra: WatchProvidersFields = {},
): Promise<boolean> {
  const data = doc.data() as TitleExtrasFields;
  const stored = { ...(extra.watchProviders ?? {}), ...(data.watchProviders ?? {}) };
  const regions = [...new Set([...(data.watchRegions ?? []), ...(extra.watchRegions ?? [])])];
  if (regions.length === 0) return false;
  const { tmdbId, mediaType } = parseTmdbId(doc.id);
  const releaseRegions = mediaType === MediaType.MOVIE ? Object.keys(data.localReleases ?? {}) : [];
  const bundle = releaseRegions.length
    ? await fetchTitleBundle(apiKey, tmdbId, mediaType, {
        credits: false,
        providers: true,
        release: true,
      })
    : null;
  const all = bundle
    ? (bundle["watch/providers"]?.results ?? {})
    : await fetchTmdbWatchProviders(apiKey, tmdbId, mediaType);
  const changed: Record<string, RegionWatchProviders> = {};
  for (const region of regions) {
    const fresh = normalizeRegion(all[region]);
    if (!sameRegionProviders(stored[region], fresh)) changed[region] = fresh;
  }
  const changedReleases: Record<string, string | null> = {};
  if (bundle?.release_dates) {
    for (const region of releaseRegions) {
      const fresh = localReleaseDate(bundle.release_dates.results, region);
      if (data.localReleases?.[region] !== fresh) changedReleases[region] = fresh;
    }
  }
  const hasProviders = Object.keys(changed).length > 0;
  const hasReleases = Object.keys(changedReleases).length > 0;
  if (!hasProviders && !hasReleases) return false;
  await doc.ref.set(
    {
      ...(hasProviders ? { watchProviders: changed } : {}),
      ...(hasReleases ? { localReleases: changedReleases } : {}),
    },
    { merge: true },
  );
  return true;
}

/**
 * Weekly (syncCatalog): every title's Where to Watch, for only the countries already stored on it
 * — countries nobody opened the title from are never written. Titles stored outside the catalog
 * that have since been added to it move onto their catalog doc.
 */
export async function syncWatchProviders(db: Firestore, apiKey: string) {
  // Docs still in the old collection: into titleExtras/ (a catalog title's are handled below)
  let moved = 0;
  const legacy = await db.collection(LEGACY_WATCH_PROVIDERS_COLLECTION).get();
  if (!legacy.empty) {
    const shows = await db.getAll(...legacy.docs.map((d) => db.collection("shows").doc(d.id)));
    for (const [i, d] of legacy.docs.entries()) {
      const target = shows[i]?.exists
        ? shows[i].ref
        : db.collection(TITLE_EXTRAS_COLLECTION).doc(d.id);
      const fields = d.data() as WatchProvidersFields;
      const has = shows[i]?.exists
        ? ((shows[i].data() as WatchProvidersFields).watchProviders ?? {})
        : {};
      const add = Object.fromEntries(
        Object.entries(fields.watchProviders ?? {}).filter(([region]) => !has[region]),
      );
      if (Object.keys(add).length > 0) {
        await target.set(
          { watchProviders: add, watchRegions: FieldValue.arrayUnion(...Object.keys(add)) },
          { merge: true },
        );
      }
      await d.ref.delete();
      moved++;
    }
  }

  const [catalog, loose] = await Promise.all([
    db.collection("shows").where("watchRegions", "!=", null).get(),
    db.collection(TITLE_EXTRAS_COLLECTION).where("watchRegions", "!=", null).get(),
  ]);
  let updated = 0;

  // A loose doc whose title now has a catalog doc: its countries move there (any the catalog doc
  // already has stay as they are), then they're dropped from it
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
