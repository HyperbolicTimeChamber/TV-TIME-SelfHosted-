import axios from "axios";
import { MediaType, TMDB_BASE, UserCollection } from "../shared/enums";
import { TMDBKeyword } from "../shared/types";
import {
  applyFacetDelta,
  countFacets,
  keywordNames,
  FacetDelta,
  sameFacets,
  titleFacets,
  TitleFacets,
  UserFacets,
} from "../shared/titleFacets";
import { getAllTrackerUids } from "./trackedBy";
import { pooled } from "./tmdb";
import { stampTracking } from "../shared/trackingSync";

/** A title's TMDB keywords on their own (catalog docs written before keywords were stored) */
export async function fetchKeywords(
  apiKey: string,
  tmdbId: number,
  mediaType: MediaType,
): Promise<string[]> {
  const kind = mediaType === MediaType.MOVIE ? "movie" : "tv";
  const { data } = await axios.get<{ results?: TMDBKeyword[]; keywords?: TMDBKeyword[] }>(
    `${TMDB_BASE}/${kind}/${tmdbId}/keywords`,
    { params: { api_key: apiKey } },
  );
  return keywordNames(data.results ?? data.keywords);
}

export const userFacetsRef = (db: FirebaseFirestore.Firestore, uid: string, mediaType: MediaType) =>
  db.doc(`users/${uid}/${UserCollection.FACETS}/${mediaType}`);

const mediaTypeOf = (showId: string) =>
  showId.startsWith(`${MediaType.MOVIE}_`) ? MediaType.MOVIE : MediaType.TV;

/**
 * Copy the catalog's genres + keywords onto a tracker's tracking doc and count them into the
 * user's facets doc — in one transaction, by the difference from what the tracking doc already
 * carried, so a repeat call (resume, refresh, the weekly sync) counts nothing twice. A doc the
 * client already removed isn't recreated. Returns what it changed (null: nothing).
 */
export async function stampTrackingFacets(
  db: FirebaseFirestore.Firestore,
  uid: string,
  showId: string,
  catalog: { genres?: string[]; keywords?: string[] },
): Promise<FacetDelta | null> {
  const trackingRef = db.doc(`users/${uid}/${UserCollection.TRACKING}/${showId}`);
  const facetsRef = userFacetsRef(db, uid, mediaTypeOf(showId));
  const next = titleFacets(catalog);
  return db
    .runTransaction(async (tx) => {
      const [tracking, facets] = await tx.getAll(trackingRef, facetsRef);
      if (!tracking.exists) return null;
      const had = tracking.data() as Partial<TitleFacets>;
      if (sameFacets(had, next)) return null;
      // Fields missing → never counted (a fresh add); present → swap the old values for the new
      const counted =
        Array.isArray(had.genres) || Array.isArray(had.keywords) ? titleFacets(had) : null;
      tx.set(facetsRef, applyFacetDelta(facets.data() as Partial<UserFacets>, counted, next));
      tx.update(trackingRef, stampTracking({ ...next }));
      return { remove: counted, add: next };
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
  mediaType: MediaType,
  catalog: { genres?: string[]; keywords?: string[] } | undefined,
): Promise<FacetDelta | null> {
  if (!catalog) return null;
  const ref = userFacetsRef(db, uid, mediaType);
  const facets = titleFacets(catalog);
  return db
    .runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) return null;
      tx.set(ref, applyFacetDelta(doc.data() as Partial<UserFacets>, facets, null));
      return { remove: facets, add: null };
    })
    .catch((err) => {
      console.error(`[titleFacets] uncount ${mediaType} failed:`, err);
      return null;
    });
}

/**
 * A catalog doc's genres / keywords changed (weekly sync, refreshShow): restamp every tracker's
 * tracking doc and move their facet counts with it. Returns how many trackers changed.
 */
export async function propagateTitleFacets(
  db: FirebaseFirestore.Firestore,
  showId: string,
  old: { genres?: string[]; keywords?: string[] } | undefined,
  fresh: { genres?: string[]; keywords?: string[] },
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
  writer: { set: (ref: FirebaseFirestore.DocumentReference, data: UserFacets) => unknown },
  db: FirebaseFirestore.Firestore,
  uid: string,
  titles: Iterable<{ id: string } & Partial<TitleFacets>>,
): Record<MediaType, UserFacets> {
  const byType: Record<MediaType, Partial<TitleFacets>[]> = {
    [MediaType.TV]: [],
    [MediaType.MOVIE]: [],
  };
  for (const t of titles) byType[mediaTypeOf(t.id)].push(t);
  const out = {
    [MediaType.TV]: countFacets(byType[MediaType.TV]),
    [MediaType.MOVIE]: countFacets(byType[MediaType.MOVIE]),
  };
  for (const mediaType of [MediaType.TV, MediaType.MOVIE]) {
    writer.set(userFacetsRef(db, uid, mediaType), out[mediaType]);
  }
  return out;
}
