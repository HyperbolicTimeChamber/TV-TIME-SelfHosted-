import { MediaType } from "../enums";
import {
	applyFacetDelta,
	facetIndexEntry,
	type FacetDelta,
	type FacetIndex,
	type UserFacetsDoc,
} from "../utils/historyView";
import { fetchUserFacetIndex, fetchUserFacets } from "./historyApi";

/**
 * The user's filter choices (users/{uid}/facets/{tv|movie}), read once a session and then kept
 * current locally: addShow / removeShow return what they changed (their `facetDelta`) and it's
 * applied here, an import hands back both docs whole — no re-read. A read waits for those calls
 * still running, so a title added a moment ago is never missing (the doc is written server-side).
 */

const key = (uid: string, mediaType: MediaType) => `${uid}_${mediaType}`;
const cache = new Map<string, UserFacetsDoc>();
const loading = new Map<string, Promise<UserFacetsDoc>>();
const inFlight = new Set<Promise<unknown>>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// Facet index per tab (null: the doc doesn't exist yet) — read with the counts, patched the same way
const indexCache = new Map<string, FacetIndex | null>();
const indexLoading = new Map<string, Promise<FacetIndex | null>>();

export function subscribeUserFacets(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function cachedUserFacets(uid: string, mediaType: MediaType): UserFacetsDoc | undefined {
	return cache.get(key(uid, mediaType));
}

export function cachedUserFacetIndex(
	uid: string,
	mediaType: MediaType,
): FacetIndex | null | undefined {
	return indexCache.get(key(uid, mediaType));
}

/** The tab's facet index: kept copy, else one read (after the facet writes in flight land) */
export function loadUserFacetIndex(uid: string, mediaType: MediaType): Promise<FacetIndex | null> {
	const k = key(uid, mediaType);
	if (indexCache.has(k)) return Promise.resolve(indexCache.get(k) ?? null);
	const pending = indexLoading.get(k);
	if (pending) return pending;
	const load = (async () => {
		await Promise.allSettled([...inFlight]);
		const index = await fetchUserFacetIndex(uid, mediaType);
		indexCache.set(k, index);
		notify();
		return index;
	})().finally(() => indexLoading.delete(k));
	indexLoading.set(k, load);
	return load;
}

/** The doc for a tab: kept copy, else one read — after the facet writes in flight land */
export function loadUserFacets(uid: string, mediaType: MediaType): Promise<UserFacetsDoc> {
	const k = key(uid, mediaType);
	const kept = cache.get(k);
	if (kept) return Promise.resolve(kept);
	const pending = loading.get(k);
	if (pending) return pending;
	const load = (async () => {
		await Promise.allSettled([...inFlight]);
		const doc = (await fetchUserFacets(uid, mediaType)) ?? {
			genres: {},
			keywords: {},
			countries: {},
			studios: {},
		};
		cache.set(k, doc);
		notify();
		return doc;
	})().finally(() => loading.delete(k));
	loading.set(k, load);
	return load;
}

/**
 * An addShow / removeShow response: apply its facetDelta to the kept doc (nothing kept → the
 * next read has it) and hand back the response without the field (it isn't catalog data)
 */
export function takeFacetDelta<T>(
	uid: string,
	mediaType: MediaType,
	response: T,
): Omit<T, "facetDelta"> {
	if (!response || typeof response !== "object" || !("facetDelta" in response)) return response;
	const { facetDelta, ...rest } = response as T & { facetDelta?: FacetDelta | null };
	const k = key(uid, mediaType);
	const kept = cache.get(k);
	if (facetDelta && kept) {
		cache.set(k, applyFacetDelta(kept, facetDelta.remove, facetDelta.add));
		notify();
	}
	// The index: this title's entry swapped (add) or dropped (remove only)
	const index = indexCache.get(k);
	if (facetDelta?.id && index) {
		const next = { ...index };
		if (facetDelta.add) next[facetDelta.id] = facetIndexEntry(facetDelta.add);
		else delete next[facetDelta.id];
		indexCache.set(k, next);
		notify();
	}
	return rest;
}

/** A call that changes the facets doc server-side: reads wait for it to land */
export function trackFacetWrite(call: Promise<unknown>): void {
	const settled = call.catch(() => {});
	inFlight.add(settled);
	settled.finally(() => inFlight.delete(settled));
}

/** An import rebuilt both docs — its response carries them */
export function setUserFacets(uid: string, docs: Partial<Record<MediaType, UserFacetsDoc>>): void {
	for (const mediaType of [MediaType.TV, MediaType.MOVIE]) {
		const doc = docs[mediaType];
		if (doc) cache.set(key(uid, mediaType), doc);
		// The import rewrote the index too — the next open reads it fresh (one read)
		indexCache.delete(key(uid, mediaType));
	}
	notify();
}
