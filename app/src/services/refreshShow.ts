import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { CloudFunction, MediaType, RefreshReason } from "../enums";
import type { CatalogShow } from "../types";
import { showDocId } from "../utils";
import { trackApi } from "./analytics";

interface RefreshShowResponse {
	refreshed: boolean;
	/** Current catalog doc without trackedBy; null when it doesn't exist */
	catalog: Omit<CatalogShow, "trackedBy"> | null;
}

// "docId|reason" → the session's one call (in flight or settled) — never asked twice
const requested = new Map<string, Promise<CatalogShow | null>>();

/**
 * Shared TMDB refresh of one catalog doc (refreshShow CF). The server dedupes across users
 * (cooldown on shows/{id}.lastTmdbCheckAt) and returns the current doc either way, so the
 * first caller's TMDB fetch reaches everyone. Resolves null on failure / missing doc.
 */
export function requestShowRefresh(
	tmdbId: number,
	mediaType: MediaType,
	reason: RefreshReason,
	seasons?: number[],
): Promise<CatalogShow | null> {
	const key = `${showDocId(tmdbId, mediaType)}|${reason}`;
	const prior = requested.get(key);
	if (prior) return prior;
	const call = trackApi("cloud_function", CloudFunction.REFRESH_SHOW, async () => {
		const res = await httpsCallable(getFunctions(), CloudFunction.REFRESH_SHOW)({
			tmdbId,
			mediaType,
			reason,
			...(seasons?.length ? { seasons } : {}),
		});
		const catalog = (res.data as RefreshShowResponse).catalog;
		return catalog ? ({ trackedBy: [], ...catalog } as CatalogShow) : null;
	}).catch(() => null);
	requested.set(key, call);
	return call;
}

/**
 * Tracked show whose catalog doc still doesn't exist (addShow failed / never ran) → addShow
 * builds it from TMDB on the server (shared) and returns it. Once per show per session.
 */
export function requestCatalogCreate(tmdbId: number, mediaType: MediaType): Promise<CatalogShow | null> {
	const key = `${showDocId(tmdbId, mediaType)}|${CloudFunction.ADD_SHOW}`;
	const prior = requested.get(key);
	if (prior) return prior;
	const call = trackApi("cloud_function", CloudFunction.ADD_SHOW, async () => {
		const res = await httpsCallable(getFunctions(), CloudFunction.ADD_SHOW)({ tmdbId, mediaType });
		const catalog = res.data as CatalogShow | null;
		return catalog?.title ? catalog : null;
	}).catch(() => null);
	requested.set(key, call);
	return call;
}

// docId → the addShow call a tracking write started (its response is the catalog doc)
const trackingCreates = new Map<string, Promise<CatalogShow | null>>();
const createWaiters = new Map<string, Set<(call: Promise<CatalogShow | null>) => void>>();

/** Tracking write's own addShow call → shared, so a catalog fill reuses its doc (no 2nd call) */
export function shareCatalogCreate(tmdbId: number, mediaType: MediaType, call: Promise<unknown>) {
	const key = showDocId(tmdbId, mediaType);
	const shared = call
		.then((data) => ((data as CatalogShow | null)?.title ? (data as CatalogShow) : null))
		.catch(() => null);
	trackingCreates.set(key, shared);
	const waiters = createWaiters.get(key);
	createWaiters.delete(key);
	waiters?.forEach((resolve) => resolve(shared));
}

/**
 * Catalog doc from the add's addShow call — already started, or started within waitMs (the
 * fill can start before the tracking write). undefined: no add call came (add failed / offline).
 */
export function awaitCatalogCreate(
	tmdbId: number,
	mediaType: MediaType,
	waitMs = 8000,
): Promise<CatalogShow | null | undefined> {
	const key = showDocId(tmdbId, mediaType);
	const started = trackingCreates.get(key);
	if (started) return started;
	return new Promise((resolve) => {
		const waiter = (call: Promise<CatalogShow | null>) => {
			clearTimeout(timer);
			call.then(resolve);
		};
		const timer = setTimeout(() => {
			createWaiters.get(key)?.delete(waiter);
			resolve(undefined);
		}, waitMs);
		if (!createWaiters.has(key)) createWaiters.set(key, new Set());
		createWaiters.get(key)!.add(waiter);
	});
}
