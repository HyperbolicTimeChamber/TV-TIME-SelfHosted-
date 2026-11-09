import axios from "axios";
import { FieldValue } from "firebase-admin/firestore";
import { FACET_INDEX_SUFFIX, MediaType, TMDB_BASE, UserCollection } from "../shared/enums";
import { TMDBKeyword } from "../shared/types";
import {
  applyFacetDelta,
  countFacets,
  countryCodes,
  FacetSource,
  studioNames,
  keywordNames,
  FacetDelta,
  facetIndexEntry,
  sameFacets,
  titleFacets,
  TitleFacets,
  UserFacets,
  UserFacetIndex,
} from "../shared/titleFacets";
import { getAllTrackerUids } from "./trackedBy";
import { pooled } from "./tmdb";
import { stampTracking } from "../shared/trackingSync";

/** A title's keywords + origin countries + studios in one TMDB call (catalog docs written before
 *  any of them was stored) */
export async function fetchFacetFields(
  apiKey: string,
  tmdbId: number,
  mediaType: MediaType,
): Promise<{ keywords: string[]; countries: string[]; studios: string[] }> {
  const kind = mediaType === MediaType.MOVIE ? "movie" : "tv";
  const { data } = await axios.get<{
    origin_country?: string[];
    networks?: Array<{ name?: string }>;
    production_companies?: Array<{ name?: string }>;
    keywords?: { results?: TMDBKeyword[]; keywords?: TMDBKeyword[] };
  }>(`${TMDB_BASE}/${kind}/${tmdbId}`, {
    params: { api_key: apiKey, append_to_response: "keywords" },
  });
  return {
    keywords: keywordNames(data.keywords?.results ?? data.keywords?.keywords),
    countries: countryCodes(data.origin_country),
    studios: studioNames(data.networks, data.production_companies),
  };
}

export const userFacetsRef = (db: FirebaseFirestore.Firestore, uid: string, mediaType: MediaType) =>
  db.doc(`users/${uid}/${UserCollection.FACETS}/${mediaType}`);

/** The per-title facet index next to the counts (facets/tvIndex, facets/movieIndex) */
export const userFacetIndexRef = (
  db: FirebaseFirestore.Firestore,
  uid: string,
  mediaType: MediaType,
) => db.doc(`users/${uid}/${UserCollection.FACETS}/${mediaType}${FACET_INDEX_SUFFIX}`);

const mediaTypeOf = (showId: string) =>
  showId.startsWith(`${MediaType.MOVIE}_`) ? MediaType.MOVIE : MediaType.TV;

/**
 * Copy the catalog's facets (genres / keywords / countries / studios) onto a tracker's tracking
 * doc and count them into the user's facets doc — in one transaction, by the difference from what the tracking doc already
 * carried, so a repeat call (resume, refresh, the weekly sync) counts nothing twice. A doc the
 * client already removed isn't recreated. Returns what it changed (null: nothing).
 */
export async function stampTrackingFacets(
  db: FirebaseFirestore.Firestore,
  uid: string,
  showId: string,
  catalog: FacetSource,
): Promise<FacetDelta | null> {
  const trackingRef = db.doc(`users/${uid}/${UserCollection.TRACKING}/${showId}`);
  const facetsRef = userFacetsRef(db, uid, mediaTypeOf(showId));
  const indexRef = userFacetIndexRef(db, uid, mediaTypeOf(showId));
  const next = titleFacets(catalog);
  return db
    .runTransaction(async (tx) => {
      const [tracking, facets, index] = await tx.getAll(trackingRef, facetsRef, indexRef);
      if (!tracking.exists) return null;
      const had = tracking.data() as Partial<TitleFacets>;
      if (sameFacets(had, next)) return null;
      // Fields missing → never counted (a fresh add); present → swap the old values for the new
      const counted =
        Array.isArray(had.genres) ||
        Array.isArray(had.keywords) ||
        Array.isArray(had.countries) ||
        Array.isArray(had.studios)
          ? titleFacets(had)
          : null;
      tx.set(facetsRef, applyFacetDelta(facets.data() as Partial<UserFacets>, counted, next));
      // Only an index built whole (import / backfill) is kept up to date — one started here
      // would hold this title alone, and the drawer would hide every other title's choices.
      // Merge: only this title's entry changes (a nested map merges key by key)
      if (index.exists) {
        tx.set(indexRef, { titles: { [showId]: facetIndexEntry(next) } }, { merge: true });
      }
      tx.update(trackingRef, stampTracking({ ...next }));
      return { id: showId, remove: counted, add: next };
    })
    .catch((err) => {
      console.error(`[titleFacets] stamp ${showId} failed:`, err);
      return null;
    });
}

/**
 * A title left the user's tracking (removeShow — the client deleted the tracking doc already):
 * take its catalog facets back out of the user's facets doc. Returns what it took out.
 */
export async function uncountTitleFacets(
  db: FirebaseFirestore.Firestore,
  uid: string,
  showId: string,
  catalog: FacetSource | undefined,
): Promise<FacetDelta | null> {
  if (!catalog) return null;
  const mediaType = mediaTypeOf(showId);
  const ref = userFacetsRef(db, uid, mediaType);
  const indexRef = userFacetIndexRef(db, uid, mediaType);
  const facets = titleFacets(catalog);
  return db
    .runTransaction(async (tx) => {
      const [doc, index] = await tx.getAll(ref, indexRef);
      if (!doc.exists) return null;
      tx.set(ref, applyFacetDelta(doc.data() as Partial<UserFacets>, facets, null));
      // Never creates the index (an empty one would hide every choice) — see stampTrackingFacets
      if (index.exists) {
        tx.update(indexRef, { [`titles.${showId}`]: FieldValue.delete() });
      }
      return { id: showId, remove: facets, add: null };
    })
    .catch((err) => {
      console.error(`[titleFacets] uncount ${mediaType} failed:`, err);
      return null;
    });
}

/**
 * A catalog doc's facets changed (weekly sync, refreshShow): restamp every tracker's
 * tracking doc and move their facet counts with it. Returns how many trackers changed.
 */
export async function propagateTitleFacets(
  db: FirebaseFirestore.Firestore,
  showId: string,
  old: FacetSource | undefined,
  fresh: FacetSource,
): Promise<number> {
  if (old && sameFacets(titleFacets(old), titleFacets(fresh))) return 0;
  const uids = await getAllTrackerUids(showId);
  let changed = 0;
  await pooled(
    uids.map((uid) => async () => {
      if (await stampTrackingFacets(db, uid, showId, fresh)) changed++;
    }),
    5,
  );
  return changed;
}

/** Both facets docs from scratch, from every tracked title's facets (import, backfill) —
 *  returns what it wrote, by media type */
export function writeUserFacets(
  writer: {
    set: (ref: FirebaseFirestore.DocumentReference, data: UserFacets | UserFacetIndex) => unknown;
  },
  db: FirebaseFirestore.Firestore,
  uid: string,
  titleList: Iterable<{ id: string } & Partial<TitleFacets>>,
): Record<MediaType, UserFacets> {
  const titles = [...titleList];
  const byType: Record<MediaType, Partial<TitleFacets>[]> = {
    [MediaType.TV]: [],
    [MediaType.MOVIE]: [],
  };
  for (const t of titles) byType[mediaTypeOf(t.id)].push(t);
  const out = {
    [MediaType.TV]: countFacets(byType[MediaType.TV]),
    [MediaType.MOVIE]: countFacets(byType[MediaType.MOVIE]),
  };
  const index: Record<MediaType, UserFacetIndex> = {
    [MediaType.TV]: { titles: {} },
    [MediaType.MOVIE]: { titles: {} },
  };
  for (const t of titles) index[mediaTypeOf(t.id)].titles[t.id] = facetIndexEntry(t);
  for (const mediaType of [MediaType.TV, MediaType.MOVIE]) {
    writer.set(userFacetsRef(db, uid, mediaType), out[mediaType]);
    writer.set(userFacetIndexRef(db, uid, mediaType), index[mediaType]);
  }
  return out;
}
