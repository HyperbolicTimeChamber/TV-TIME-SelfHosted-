import {
	getFirestore,
	collection,
	doc,
	getDoc,
	getDocFromCache,
	getDocs,
	deleteDoc,
	query,
	where,
	updateDoc,
	writeBatch,
	runTransaction,
	serverTimestamp,
	increment,
	Timestamp,
} from "@react-native-firebase/firestore";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { WatchStatus, MediaType, CloudFunction, CatalogShow } from "../types";
import { WatchProgress } from "../enums";
import { showDocId, emitHistoryChange, localizeCatalog } from "../utils";
import { trackApi } from "./analytics";
import { historyOnWatch, historyOnUnwatch, historyCleared, historyOnChange } from "./history";
import { shareCatalogCreate } from "./refreshShow";
import { batchEndOffsets } from "../utils/stagger";

/** Tracked Cloud Function call */
function callCF<T = any>(name: string, data: any): Promise<T> {
	return trackApi("cloud_function", name, async () => {
		const result = await httpsCallable(getFunctions(), name)(data);
		return result.data as T;
	});
}

const db = getFirestore();

function userRef(userId: string) {
	return doc(db, "users", userId);
}

function trackingRef(userId: string) {
	return collection(doc(db, "users", userId), "tracking");
}

function watchedEpisodesRef(userId: string) {
	return collection(doc(db, "users", userId), "watchedEpisodes");
}

function watchedMoviesRef(userId: string) {
	return collection(doc(db, "users", userId), "watchedMovies");
}

function episodeDocId(tmdbShowId: number, season: number, episode: number) {
	const s = String(season).padStart(2, "0");
	const e = String(episode).padStart(2, "0");
	return `${tmdbShowId}_S${s}E${e}`;
}

// --- Catalog (shared show data) ---

export async function getCatalogShow(
	tmdbId: number,
	mediaType: MediaType = MediaType.TV,
): Promise<CatalogShow | null> {
	return trackApi("firestore", "getCatalogShow", async () => {
		const docId = showDocId(tmdbId, mediaType);
		const showDoc = await getDoc(doc(db, "shows", docId));
		if (!showDoc.exists()) return null;
		return localizeCatalog({ id: showDoc.id, ...showDoc.data() } as unknown as CatalogShow);
	});
}

export async function getHighestWatchedEpisode(
	userId: string,
	tmdbShowId: number,
): Promise<{ season: number; episode: number } | null> {
	return trackApi("firestore", "getHighestWatchedEpisode", async () => {
		const epCol = watchedEpisodesRef(userId);
		const snap = await getDocs(query(epCol, where("tmdbShowId", "==", tmdbShowId)));
		let highest: { season: number; episode: number } | null = null;
		for (const d of snap.docs) {
			const data = d.data();
			if (
				!highest ||
				data.season > highest.season ||
				(data.season === highest.season && data.episode > highest.episode)
			) {
				highest = { season: data.season, episode: data.episode };
			}
		}
		return highest;
	});
}

// --- Error helpers ---

function getCallableErrorMessage(err: any): string {
	const code = err?.code;
	const msg = err?.message;
	if (code === "functions/not-found") return "Show not found on TMDB.";
	if (code === "functions/failed-precondition") return msg || "Service misconfigured.";
	if (code === "functions/unavailable") return "Could not reach TMDB. Try again later.";
	if (code === "functions/unauthenticated") return "You must be signed in.";
	if (code === "functions/invalid-argument") return msg || "Invalid request.";
	return msg || "Something went wrong. Try again.";
}

export { getCallableErrorMessage };

// --- Tracking CRUD ---

export async function addToTracking(
	userId: string,
	tmdbId: number,
	mediaType: MediaType,
	releaseDate?: string | null,
	meta?: {
		title?: string;
		posterPath?: string | null;
		nextEpisodeName?: string | null;
		nextEpisodeAirDate?: string | null;
	},
): Promise<void> {
	const docId = showDocId(tmdbId, mediaType);
	const now = Timestamp.now();

	let priorityDate = now;
	if (mediaType === MediaType.MOVIE && releaseDate) {
		const releaseDateMs = new Date(releaseDate).getTime();
		if (releaseDateMs > now.toMillis()) {
			priorityDate = Timestamp.fromMillis(releaseDateMs);
		}
	}

	// Check if already tracked to avoid double-counting
	const tRef = doc(trackingRef(userId), docId);
	const existingDoc = await getDoc(tRef);
	const alreadyTracked = existingDoc.exists();

	// Write tracking doc immediately — no catalog read needed
	const batch = writeBatch(db);
	batch.set(tRef, {
		tmdbId,
		mediaType,
		status: WatchStatus.WATCHING,
		nextEpisode: mediaType === MediaType.TV ? { season: 1, episode: 1 } : null,
		nextEpisodeName: meta?.nextEpisodeName ?? null,
		nextEpisodeAirDate: meta?.nextEpisodeAirDate ?? null,
		rewatchCount: 0,
		addedAt: now,
		lastWatchedAt: now,
		priorityDate,
		...(mediaType === MediaType.MOVIE ? { releaseDate: releaseDate || null } : {}),
		...(meta?.title ? { title: meta.title } : {}),
		...(meta?.posterPath ? { posterPath: meta.posterPath } : {}),
	});
	if (!alreadyTracked) {
		batch.set(userRef(userId), { stats: { showsTracking: increment(1) } }, { merge: true });
	}
	await batch.commit();

	// Background: ensure catalog exists + update trackedBy
	// If CF fails after retry → rollback tracking doc + call onError
	const callAddShow = () => callCF(CloudFunction.ADD_SHOW, { tmdbId, mediaType });
	const addShow = callAddShow().catch(() =>
		callAddShow().catch(async (err: unknown) => {
			// Both attempts failed — undo the local add
			const rollback = writeBatch(db);
			rollback.delete(tRef);
			if (!alreadyTracked) {
				rollback.set(userRef(userId), { stats: { showsTracking: increment(-1) } }, { merge: true });
			}
			await rollback.commit().catch(() => {});
			// Emit error for UI to pick up
			addTrackingErrorListeners.forEach((fn) => fn(tmdbId, meta?.title || `Show #${tmdbId}`));
			// Rejects so the shared catalog fill falls back
			throw err;
		}),
	);
	// Its response is the catalog doc → a background catalog fill reuses it
	shareCatalogCreate(tmdbId, mediaType, addShow);
	addShow.catch(() => {});
}

// Error listeners for background CF failures
type AddTrackingErrorCallback = (tmdbId: number, title: string) => void;
const addTrackingErrorListeners = new Set<AddTrackingErrorCallback>();
export function onAddTrackingError(cb: AddTrackingErrorCallback): () => void {
	addTrackingErrorListeners.add(cb);
	return () => addTrackingErrorListeners.delete(cb);
}

export async function removeFromTracking(
	userId: string,
	tmdbId: number,
	mediaType: MediaType,
): Promise<void> {
	// Delete tracking doc + decrement stats immediately
	const docId = showDocId(tmdbId, mediaType);
	const batch = writeBatch(db);
	batch.delete(doc(trackingRef(userId), docId));
	batch.set(userRef(userId), { stats: { showsTracking: increment(-1) } }, { merge: true });
	await batch.commit();
	// Deleted docs never show up in the delta query — drop the card locally
	emitHistoryChange({ userId, tmdbId, mediaType, cleared: true });

	// Background: update trackedBy on catalog doc (CF handles cleanup)
	callCF(CloudFunction.REMOVE_SHOW, { tmdbId, mediaType }).catch((err: any) =>
		console.error("[removeFromTracking] removeShow CF failed:", err),
	);
}

export async function stopWatching(
	userId: string,
	tmdbId: number,
	currentStatus: WatchStatus,
	mediaType: MediaType,
) {
	let newStatus: WatchStatus;
	if (currentStatus === WatchStatus.REWATCHING) {
		newStatus = WatchStatus.PAUSED_REWATCH;
	} else if (currentStatus === WatchStatus.WATCHING) {
		newStatus = WatchStatus.PAUSED;
	} else {
		newStatus = WatchStatus.COMPLETED;
	}
	const docId = showDocId(tmdbId, mediaType);
	await updateDoc(doc(trackingRef(userId), docId), {
		status: newStatus,
		...historyOnChange(),
	});
	emitHistoryChange({ userId, tmdbId, mediaType, status: newStatus });
	clearUpcomingDocs(userId, tmdbId);
}

/**
 * How far the user got (plays > 0 = anything watched) — remove is blocked past NONE until the
 * history is cleared. Local cache first (the watchlist listener usually holds the doc → 0
 * reads); server only on a miss.
 */
export async function getWatchProgress(
	userId: string,
	tmdbId: number,
	mediaType: MediaType,
): Promise<WatchProgress> {
	const ref = doc(trackingRef(userId), showDocId(tmdbId, mediaType));
	const snap = await getDocFromCache(ref).catch(() => getDoc(ref));
	const data = snap.data();
	const status = data?.status as WatchStatus | undefined;
	const played = ((data?.plays as number | undefined) ?? 0) > 0;
	if (mediaType === MediaType.MOVIE) {
		// Older movie docs may predate plays — a completed movie was watched
		return played || status === WatchStatus.COMPLETED ? WatchProgress.WATCHED : WatchProgress.NONE;
	}
	if (!played) return WatchProgress.NONE;
	return status === WatchStatus.COMPLETED ||
		status === WatchStatus.REWATCHING ||
		status === WatchStatus.PAUSED_REWATCH
		? WatchProgress.WATCHED
		: WatchProgress.STARTED;
}

/** Clean the upcoming subcollection for this show (fire-and-forget) — paused shows have none */
function clearUpcomingDocs(userId: string, tmdbId: number) {
	const upcomingCol = collection(doc(db, "users", userId), "upcoming");
	getDocs(query(upcomingCol, where("tmdbShowId", "==", tmdbId)))
		.then(async (snap) => {
			for (const d of snap.docs) {
				await deleteDoc(d.ref);
			}
		})
		.catch(() => {});
}

/** Extra tracking-doc effects for mark actions (see utils/trackingAdvance) */
export interface TrackingWriteOpts {
	/** Leave tracking doc untouched (markSeasonWatchedCF only) */
	skipTracking?: boolean;
	status?: WatchStatus;
	incrementRewatch?: boolean;
	/** Absolute rewatch run number to store (wins over incrementRewatch) */
	rewatchCount?: number;
	/** markSeasonWatchedCF only: how long before now this batch's last episode counts as
	 *  finished, when one catch-up spans several calls (see batchEndOffsets) */
	endOffsetMs?: number;
}

/** Tracking fields a caller already holds — saves the unwatch paths a tracking-doc read */
export interface KnownTracking {
	status?: WatchStatus;
	rewatchCount?: number;
}

export async function markEpisodeWatched(
	userId: string,
	tmdbShowId: number,
	season: number,
	episode: number,
	episodeTitle: string,
	runtime: number,
	nextEpisode: { season: number; episode: number } | null,
	isShowComplete: boolean,
	skipTrackingUpdate: boolean = false,
	nextEpisodeName: string | null = null,
	nextEpisodeAirDate: string | null = null,
	opts: TrackingWriteOpts = {},
) {
	const docId = episodeDocId(tmdbShowId, season, episode);
	const epRef = doc(watchedEpisodesRef(userId), docId);

	// Every write here is an increment or a merge, so no read is needed to stay correct
	await runTransaction(db, async (tx) => {
		tx.set(
			epRef,
			{
				tmdbShowId,
				season,
				episode,
				episodeTitle,
				lastWatchedAt: serverTimestamp(),
				runtime,
				watchCount: increment(1),
			},
			{ merge: true },
		);

		// Episodes and Watch Time both count every watch, rewatches included. Counting only
		// unique episodes here made the stat drift: unwatching one play of a rewatched episode
		// still decrements it (see unwatch below), so a rewatch + unwatch left it one short.
		// The bulk season mark and the movie paths already count every play.
		tx.set(
			userRef(userId),
			{
				stats: {
					episodesWatched: increment(1),
					totalMinutes: increment(runtime),
				},
			},
			{ merge: true },
		);

		if (!skipTrackingUpdate) {
			const now = Timestamp.now();
			const trackingUpdate: Record<string, unknown> = {
				lastWatchedAt: now,
				priorityDate: now,
				nextEpisode,
				nextEpisodeName,
				nextEpisodeAirDate: nextEpisodeAirDate ?? null,
			};
			if (isShowComplete) {
				trackingUpdate.status = WatchStatus.COMPLETED;
			}
			if (opts.status) trackingUpdate.status = opts.status;
			if (typeof opts.rewatchCount === "number") trackingUpdate.rewatchCount = opts.rewatchCount;
			else if (opts.incrementRewatch) trackingUpdate.rewatchCount = increment(1);
			tx.update(doc(trackingRef(userId), showDocId(tmdbShowId, MediaType.TV)), {
				...trackingUpdate,
				...historyOnWatch(runtime, 1, now, { season, episode }),
			});
		} else {
			// Pointer stays put, but the watch still counts for Watch History
			tx.set(
				doc(trackingRef(userId), showDocId(tmdbShowId, MediaType.TV)),
				historyOnWatch(runtime, 1, undefined, { season, episode }),
				{ merge: true },
			);
		}
	});
	emitHistoryChange({
		userId,
		tmdbId: tmdbShowId,
		mediaType: MediaType.TV,
		watched: true,
		minutesDelta: runtime,
		playsDelta: 1,
		lastEpisode: { season, episode },
		...(skipTrackingUpdate
			? {}
			: {
					nextEpisode,
					status: opts.status ?? (isShowComplete ? WatchStatus.COMPLETED : undefined),
					...(typeof opts.rewatchCount === "number"
						? { rewatchCount: opts.rewatchCount }
						: { rewatchDelta: opts.incrementRewatch ? 1 : 0 }),
				}),
	});

	// Watched → out of the server upcoming list too (doc id from the upcoming CFs), so a
	// later upcoming refetch doesn't bring it back. Fire-and-forget: missing doc is fine
	deleteDoc(
		doc(
			collection(doc(db, "users", userId), "upcoming"),
			`${showDocId(tmdbShowId, MediaType.TV)}_${docId.slice(docId.indexOf("_") + 1)}`,
		),
	).catch(() => {});
}

/** Unwatching back to a hole in the first watch ends any rewatch (a show can't be rewatched
 *  before it's finished) — take that rewatch's count back too, or a "Rewatch N" tag lingers */
async function droppedRewatchFields(userId: string, tmdbShowId: number, known?: KnownTracking) {
	// Caller's live tracking doc → no read (a server round trip held the unwatch back)
	const data = known
		? known
		: (await getDoc(doc(trackingRef(userId), showDocId(tmdbShowId, MediaType.TV)))).data();
	const status = data?.status;
	const inRewatch = status === WatchStatus.REWATCHING || status === WatchStatus.PAUSED_REWATCH;
	return inRewatch && (data?.rewatchCount ?? 0) > 0 ? { rewatchCount: increment(-1) } : {};
}

/** Self-heal: store the rewatch run number the episode counts show (see observedRewatchRun) */
export async function setRewatchCount(userId: string, tmdbShowId: number, rewatchCount: number) {
	await updateDoc(doc(trackingRef(userId), showDocId(tmdbShowId, MediaType.TV)), {
		rewatchCount,
		...historyOnChange(),
	});
	emitHistoryChange({ userId, tmdbId: tmdbShowId, mediaType: MediaType.TV, rewatchCount });
}

export async function unmarkEpisodeWatched(
	userId: string,
	tmdbShowId: number,
	season: number,
	episode: number,
	runtime: number,
	episodeName?: string | null,
	nextEpisodeAirDate?: string | null,
	known?: KnownTracking,
) {
	const docId = episodeDocId(tmdbShowId, season, episode);
	const epRef = doc(watchedEpisodesRef(userId), docId);

	const batch = writeBatch(db);
	batch.delete(epRef);
	batch.set(
		userRef(userId),
		{
			stats: {
				episodesWatched: increment(-1),
				totalMinutes: increment(-runtime),
			},
		},
		{ merge: true },
	);
	// Update tracking to point to this now-unwatched episode
	batch.set(
		doc(trackingRef(userId), showDocId(tmdbShowId, MediaType.TV)),
		{
			nextEpisode: { season, episode },
			nextEpisodeName: episodeName || null,
			nextEpisodeAirDate: nextEpisodeAirDate || null,
			status: WatchStatus.WATCHING,
			priorityDate: Timestamp.now(),
			...historyOnUnwatch(runtime),
			...(await droppedRewatchFields(userId, tmdbShowId, known)),
		},
		{ merge: true },
	);
	await batch.commit();
	emitHistoryChange({
		userId,
		tmdbId: tmdbShowId,
		mediaType: MediaType.TV,
		minutesDelta: -runtime,
		playsDelta: -1,
		nextEpisode: { season, episode },
		status: WatchStatus.WATCHING,
	});
}

export async function decrementEpisodeWatchCount(
	userId: string,
	tmdbShowId: number,
	season: number,
	episode: number,
	runtime: number,
	currentWatchCount: number,
	episodeName?: string | null,
	nextEpisodeAirDate?: string | null,
	known?: KnownTracking,
) {
	const docId = episodeDocId(tmdbShowId, season, episode);
	const epRef = doc(watchedEpisodesRef(userId), docId);
	const batch = writeBatch(db);

	const willDelete = currentWatchCount <= 1;
	if (willDelete) {
		batch.delete(epRef);
	} else {
		batch.update(epRef, {
			watchCount: increment(-1),
		});
	}

	batch.set(
		userRef(userId),
		{
			stats: {
				episodesWatched: increment(-1),
				totalMinutes: increment(-runtime),
			},
		},
		{ merge: true },
	);

	// When fully unwatched, update tracking to point back to this episode
	batch.set(
		doc(trackingRef(userId), showDocId(tmdbShowId, MediaType.TV)),
		{
			...(willDelete
				? {
						nextEpisode: { season, episode },
						nextEpisodeName: episodeName || null,
						nextEpisodeAirDate: nextEpisodeAirDate || null,
						status: WatchStatus.WATCHING,
						priorityDate: Timestamp.now(),
						...(await droppedRewatchFields(userId, tmdbShowId, known)),
					}
				: {}),
			...historyOnUnwatch(runtime),
		},
		{ merge: true },
	);

	await batch.commit();
	emitHistoryChange({
		userId,
		tmdbId: tmdbShowId,
		mediaType: MediaType.TV,
		minutesDelta: -runtime,
		playsDelta: -1,
		...(willDelete ? { nextEpisode: { season, episode }, status: WatchStatus.WATCHING } : {}),
	});
}

/**
 * Move the watchlist pointer only (no watches written) — the watch count sheet's "Whoa there
 * Speedster!" "Just This One". Carries everything the watchlist card shows (next episode, its
 * name / air date) and bumps priorityDate so the card comes up top.
 */
export async function setNextEpisode(
	userId: string,
	tmdbShowId: number,
	next: { season: number; episode: number; name: string | null; airDate: string | null },
) {
	const now = Timestamp.now();
	await updateDoc(doc(trackingRef(userId), showDocId(tmdbShowId, MediaType.TV)), {
		nextEpisode: { season: next.season, episode: next.episode },
		nextEpisodeName: next.name,
		nextEpisodeAirDate: next.airDate,
		lastWatchedAt: now,
		priorityDate: now,
		...historyOnChange(),
	});
	emitHistoryChange({
		userId,
		tmdbId: tmdbShowId,
		mediaType: MediaType.TV,
		nextEpisode: { season: next.season, episode: next.episode },
	});
}

/**
 * Watch count sheet: set one episode's plays from → to (the sheet debounces taps, so +3 is one
 * write). Resolves with the count the episode ends up at.
 * - Up: one batch, no read; lastWatchedAt now (the row moves to the top of Previously Watched).
 * - Down: a transaction that reads the episode's real count first — a cached count can be stale
 *   (a mark from elsewhere), and trusting it deleted a record that still had watches. Only a
 *   real 0 deletes it; the rest is taken off what's actually there.
 * `pointer`: an episode → the watchlist pointer moves there (info page, see stepperPointer);
 * null → it stays; omitted (watchlist, no episode order at hand) → only on a real 0, back to
 * this episode, as unmarkEpisodeWatched does.
 */
export async function writeEpisodeWatchCount(
	userId: string,
	tmdbShowId: number,
	ep: { season: number; episode: number; title: string; runtime: number; airDate?: string | null },
	from: number,
	to: number,
	known?: KnownTracking,
	pointer?: { season: number; episode: number; name: string | null; airDate: string | null } | null,
): Promise<number> {
	if (to === from) return to;
	const runtime = ep.runtime || 0;
	const epRef = doc(watchedEpisodesRef(userId), episodeDocId(tmdbShowId, ep.season, ep.episode));
	const tRef = doc(trackingRef(userId), showDocId(tmdbShowId, MediaType.TV));
	const now = Timestamp.now();
	/** Tracking fields for a pointer move (with what the watchlist card shows) */
	const moveFields = (m: {
		season: number;
		episode: number;
		name: string | null;
		airDate: string | null;
	}) => ({
		nextEpisode: { season: m.season, episode: m.episode },
		nextEpisodeName: m.name,
		nextEpisodeAirDate: m.airDate,
		priorityDate: now,
	});

	if (to > from) {
		const delta = to - from;
		const minutes = runtime * delta;
		const batch = writeBatch(db);
		batch.set(
			epRef,
			{
				tmdbShowId,
				season: ep.season,
				episode: ep.episode,
				episodeTitle: ep.title,
				runtime,
				watchCount: increment(delta),
				lastWatchedAt: now,
				// Back from 0 within one edit: the doc was deleted — give it its first watch time
				...(from <= 0 ? { watchedAt: now } : {}),
			},
			{ merge: true },
		);
		batch.set(
			userRef(userId),
			{ stats: { episodesWatched: increment(delta), totalMinutes: increment(minutes) } },
			{ merge: true },
		);
		batch.set(
			tRef,
			{
				...historyOnWatch(minutes, delta, now, { season: ep.season, episode: ep.episode }),
				...(pointer ? { ...moveFields(pointer), lastWatchedAt: now } : {}),
			},
			{ merge: true },
		);
		await batch.commit();
		emitHistoryChange({
			userId,
			tmdbId: tmdbShowId,
			mediaType: MediaType.TV,
			minutesDelta: minutes,
			playsDelta: delta,
			watched: true,
			lastEpisode: { season: ep.season, episode: ep.episode },
			...(pointer ? { nextEpisode: { season: pointer.season, episode: pointer.episode } } : {}),
		});
		return to;
	}

	// Down: off the real count
	// Rewatch fields the legacy "unwatched" path drops — read only when heading for 0
	// Legacy "unwatched" (a real 0, no pointer given): a first watch again — unless a rewatch is
	// under way, which must never end here (status and run number stay; only the pointer moves)
	let resetFields: Record<string, unknown> = {};
	if (pointer === undefined && to <= 0) {
		const data = known
			? known
			: (await getDoc(doc(trackingRef(userId), showDocId(tmdbShowId, MediaType.TV)))).data();
		const inRewatch =
			data?.status === WatchStatus.REWATCHING || data?.status === WatchStatus.PAUSED_REWATCH;
		if (!inRewatch) resetFields = { status: WatchStatus.WATCHING };
	}
	const result = await runTransaction(db, async (tx) => {
		const snap = await tx.get(epRef);
		const actual = (snap.data()?.watchCount as number | undefined) ?? 0;
		const final = Math.max(0, actual - (from - to));
		const removed = actual - final;
		if (removed <= 0) return { final: actual, removed: 0, legacyBack: false };
		if (final <= 0) tx.delete(epRef);
		else tx.update(epRef, { watchCount: final });
		tx.set(
			userRef(userId),
			{
				stats: {
					episodesWatched: increment(-removed),
					totalMinutes: increment(-runtime * removed),
				},
			},
			{ merge: true },
		);
		// Legacy (watchlist): really unwatched → pointer back here, a first watch again
		const legacyBack = pointer === undefined && final <= 0;
		const moveTo = legacyBack
			? {
					season: ep.season,
					episode: ep.episode,
					name: ep.title || null,
					airDate: ep.airDate ?? null,
				}
			: (pointer ?? null);
		tx.set(
			tRef,
			{
				...historyOnUnwatch(runtime * removed, removed),
				...(moveTo ? moveFields(moveTo) : {}),
				...(legacyBack ? resetFields : {}),
			},
			{ merge: true },
		);
		return { final, removed, legacyBack, moveTo };
	});
	if (result.removed > 0) {
		emitHistoryChange({
			userId,
			tmdbId: tmdbShowId,
			mediaType: MediaType.TV,
			minutesDelta: -runtime * result.removed,
			playsDelta: -result.removed,
			...(result.moveTo
				? { nextEpisode: { season: result.moveTo.season, episode: result.moveTo.episode } }
				: {}),
			...(result.legacyBack && resetFields.status ? { status: WatchStatus.WATCHING } : {}),
		});
	}
	return result.final;
}

export async function unmarkSeasonWatched(
	userId: string,
	tmdbShowId: number,
	episodes: Array<{ season: number; episode: number; runtime: number }>,
	known?: KnownTracking,
) {
	const seasonNumber = episodes[0]?.season;
	if (seasonNumber == null) return;

	// Query ALL watchedEpisode docs for this show+season (catches orphans beyond TMDB count)
	const allSeasonDocs = await getDocs(
		query(
			watchedEpisodesRef(userId),
			where("tmdbShowId", "==", tmdbShowId),
			where("season", "==", seasonNumber),
		),
	);

	const batch = writeBatch(db);
	let deleteCount = 0;
	// Every play (rewatches too) goes away here — Watch Time + Watch History
	let historyMinutes = 0;
	let historyPlays = 0;

	for (const d of allSeasonDocs.docs) {
		batch.delete(d.ref);
		const { runtime = 0, watchCount = 1 } = d.data();
		deleteCount++;
		historyMinutes += runtime * watchCount;
		historyPlays += watchCount;
	}

	if (deleteCount === 0) return;

	batch.set(
		userRef(userId),
		{
			stats: {
				episodesWatched: increment(-deleteCount),
				// Every play of these episodes leaves Watch Time
				totalMinutes: increment(-historyMinutes),
			},
		},
		{ merge: true },
	);

	// Reset tracking to first episode of the unmarked season
	const firstEp = episodes.reduce((min, ep) => (ep.episode < min.episode ? ep : min), episodes[0]);
	batch.set(
		doc(trackingRef(userId), showDocId(tmdbShowId, MediaType.TV)),
		{
			nextEpisode: { season: firstEp.season, episode: firstEp.episode },
			status: WatchStatus.WATCHING,
			priorityDate: Timestamp.now(),
			...historyOnUnwatch(historyMinutes, historyPlays),
			...(await droppedRewatchFields(userId, tmdbShowId, known)),
		},
		{ merge: true },
	);

	await batch.commit();
	emitHistoryChange({
		userId,
		tmdbId: tmdbShowId,
		mediaType: MediaType.TV,
		minutesDelta: -historyMinutes,
		playsDelta: -historyPlays,
		nextEpisode: { season: firstEp.season, episode: firstEp.episode },
		status: WatchStatus.WATCHING,
	});
}

export async function decrementSeasonWatchCount(
	userId: string,
	tmdbShowId: number,
	episodes: Array<{
		season: number;
		episode: number;
		runtime: number;
		watchCount: number;
	}>,
) {
	const batch = writeBatch(db);
	let totalRuntime = 0;
	let count = 0;

	for (const ep of episodes) {
		if (ep.watchCount <= 0) continue;
		const docId = episodeDocId(tmdbShowId, ep.season, ep.episode);
		const epRef = doc(watchedEpisodesRef(userId), docId);

		if (ep.watchCount <= 1) {
			batch.delete(epRef);
		} else {
			batch.update(epRef, { watchCount: increment(-1) });
		}
		totalRuntime += ep.runtime;
		count++;
	}

	if (count > 0) {
		batch.set(
			userRef(userId),
			{
				stats: {
					episodesWatched: increment(-count),
					totalMinutes: increment(-totalRuntime),
				},
			},
			{ merge: true },
		);
		batch.set(
			doc(trackingRef(userId), showDocId(tmdbShowId, MediaType.TV)),
			historyOnUnwatch(totalRuntime, count),
			{ merge: true },
		);
	}

	await batch.commit();
	if (count > 0) {
		emitHistoryChange({
			userId,
			tmdbId: tmdbShowId,
			mediaType: MediaType.TV,
			minutesDelta: -totalRuntime,
			playsDelta: -count,
		});
	}
}

/**
 * "Watched once": every listed episode back to a single watch (extra plays removed). Info page
 * season / episode sheet. Episodes already at 1 (or unwatched) are skipped.
 */
export async function resetEpisodesToOnce(
	userId: string,
	tmdbShowId: number,
	episodes: Array<{ season: number; episode: number; runtime: number; watchCount: number }>,
) {
	const extra = episodes.filter((ep) => ep.watchCount > 1);
	if (extra.length === 0) return;
	const batch = writeBatch(db);
	let plays = 0;
	let minutes = 0;
	for (const ep of extra) {
		batch.update(doc(watchedEpisodesRef(userId), episodeDocId(tmdbShowId, ep.season, ep.episode)), {
			watchCount: 1,
		});
		plays += ep.watchCount - 1;
		minutes += ep.runtime * (ep.watchCount - 1);
	}
	batch.set(
		userRef(userId),
		{ stats: { episodesWatched: increment(-plays), totalMinutes: increment(-minutes) } },
		{ merge: true },
	);
	batch.set(
		doc(trackingRef(userId), showDocId(tmdbShowId, MediaType.TV)),
		historyOnUnwatch(minutes, plays),
		{ merge: true },
	);
	await batch.commit();
	emitHistoryChange({
		userId,
		tmdbId: tmdbShowId,
		mediaType: MediaType.TV,
		minutesDelta: -minutes,
		playsDelta: -plays,
	});
}

export async function startRewatch(userId: string, tmdbId: number, mediaType: MediaType) {
	const docId = showDocId(tmdbId, mediaType);
	await updateDoc(doc(trackingRef(userId), docId), {
		status: WatchStatus.REWATCHING,
		rewatchCount: increment(1),
		nextEpisode: { season: 1, episode: 1 },
		lastWatchedAt: serverTimestamp(),
		priorityDate: serverTimestamp(),
		...historyOnChange(),
	});
	emitHistoryChange({
		userId,
		tmdbId,
		mediaType,
		status: WatchStatus.REWATCHING,
		nextEpisode: { season: 1, episode: 1 },
		rewatchDelta: 1,
	});
}

/**
 * Back from PAUSED / PAUSED_REWATCH. Bumps priorityDate (top of the watchlist, and
 * inside the listener's first page) and rebuilds the show's upcoming docs that
 * stopWatching deleted — upcoming is CF-write-only, addShow's fast path does it.
 */
async function resume(userId: string, tmdbId: number, mediaType: MediaType, status: WatchStatus) {
	await updateDoc(doc(trackingRef(userId), showDocId(tmdbId, mediaType)), {
		status,
		priorityDate: serverTimestamp(),
		...historyOnChange(),
	});
	emitHistoryChange({ userId, tmdbId, mediaType, status });
	if (mediaType === MediaType.TV) {
		callCF(CloudFunction.ADD_SHOW, { tmdbId, mediaType }).catch((err: any) =>
			console.error("[resume] addShow CF failed:", err),
		);
	}
}

export async function resumeWatching(userId: string, tmdbId: number, mediaType: MediaType) {
	await resume(userId, tmdbId, mediaType, WatchStatus.WATCHING);
}

/** Reset a show back to S1E1 / watching (e.g. COMPLETED with nothing watched) */
export async function restartWatching(userId: string, tmdbId: number) {
	await updateDoc(doc(trackingRef(userId), showDocId(tmdbId, MediaType.TV)), {
		status: WatchStatus.WATCHING,
		nextEpisode: { season: 1, episode: 1 },
		priorityDate: serverTimestamp(),
		...historyOnChange(),
	});
	emitHistoryChange({
		userId,
		tmdbId,
		mediaType: MediaType.TV,
		status: WatchStatus.WATCHING,
		nextEpisode: { season: 1, episode: 1 },
	});
}

/**
 * Rewatch only: move the pointer past an episode without watching it.
 * No watchedEpisodes write, no stats change, no priority bump. Last episode → rewatch done.
 */
export async function skipRewatchEpisode(
	userId: string,
	tmdbId: number,
	nextEpisode: { season: number; episode: number } | null,
	nextEpisodeName: string | null,
	nextEpisodeAirDate: string | null,
) {
	await updateDoc(doc(trackingRef(userId), showDocId(tmdbId, MediaType.TV)), {
		nextEpisode,
		nextEpisodeName,
		nextEpisodeAirDate,
		...(nextEpisode ? {} : { status: WatchStatus.COMPLETED }),
		...historyOnChange(),
	});
	emitHistoryChange({
		userId,
		tmdbId,
		mediaType: MediaType.TV,
		nextEpisode,
		...(nextEpisode ? {} : { status: WatchStatus.COMPLETED }),
	});
}

export async function resumeRewatch(userId: string, tmdbId: number, mediaType: MediaType) {
	await resume(userId, tmdbId, mediaType, WatchStatus.REWATCHING);
}

/** Callers often only have a tracking item / search hit (no runtime) → read it off the
 *  shared catalog doc, so Watch Time and history minutes aren't stored as 0 */
async function resolveMovieRuntime(tmdbId: number, runtime: number): Promise<number> {
	if (runtime > 0) return runtime;
	try {
		const snap = await getDoc(doc(db, "shows", showDocId(tmdbId, MediaType.MOVIE)));
		return (snap.data()?.runtime as number | undefined) || 0;
	} catch {
		return 0;
	}
}

export async function markMovieWatched(
	userId: string,
	tmdbId: number,
	runtime: number,
): Promise<void> {
	runtime = await resolveMovieRuntime(tmdbId, runtime);
	const batch = writeBatch(db);
	const movieRef = doc(watchedMoviesRef(userId), String(tmdbId));
	const tRef = doc(trackingRef(userId), showDocId(tmdbId, MediaType.MOVIE));
	const now = serverTimestamp();

	batch.set(
		movieRef,
		{
			tmdbId,
			lastWatchedAt: now,
			runtime: runtime || 0,
			watchCount: increment(1),
		},
		{ merge: true },
	);

	batch.set(
		tRef,
		{
			status: WatchStatus.COMPLETED,
			lastWatchedAt: now,
			priorityDate: now,
			...historyOnWatch(runtime || 0),
		},
		{ merge: true },
	);
	batch.set(
		userRef(userId),
		{
			stats: {
				moviesWatched: increment(1),
				totalMinutes: increment(runtime || 0),
			},
		},
		{ merge: true },
	);

	await batch.commit();
	emitHistoryChange({
		userId,
		tmdbId,
		mediaType: MediaType.MOVIE,
		watched: true,
		minutesDelta: runtime || 0,
		playsDelta: 1,
		status: WatchStatus.COMPLETED,
	});
}

export async function decrementMovieWatchCount(
	userId: string,
	tmdbId: number,
	runtime: number,
	currentCount: number,
): Promise<void> {
	const batch = writeBatch(db);
	const movieRef = doc(watchedMoviesRef(userId), String(tmdbId));

	const willDelete = currentCount <= 1;
	if (willDelete) {
		batch.delete(movieRef);
	} else {
		batch.update(movieRef, { watchCount: increment(-1) });
	}
	batch.set(
		userRef(userId),
		{
			stats: {
				moviesWatched: increment(-1),
				totalMinutes: increment(-(runtime || 0)),
			},
		},
		{ merge: true },
	);
	// When fully unwatched, revert tracking status (and leave Watch History)
	batch.set(
		doc(trackingRef(userId), showDocId(tmdbId, MediaType.MOVIE)),
		willDelete
			? { status: WatchStatus.WATCHING, priorityDate: Timestamp.now(), ...historyCleared() }
			: historyOnUnwatch(runtime || 0),
		{ merge: true },
	);

	await batch.commit();
	emitHistoryChange({
		userId,
		tmdbId,
		mediaType: MediaType.MOVIE,
		...(willDelete ? { cleared: true } : { minutesDelta: -(runtime || 0), playsDelta: -1 }),
	});
}

/**
 * Detail page watch count sheet: set a movie's plays from → to in one batch (the sheet
 * debounces taps, so +3 is one write). 0 → unwatched (tracking back to watching, out of history).
 */
export async function writeMovieWatchCount(
	userId: string,
	tmdbId: number,
	runtime: number,
	from: number,
	to: number,
): Promise<number> {
	if (to === from) return to;
	runtime = (await resolveMovieRuntime(tmdbId, runtime)) || 0;
	const movieRef = doc(watchedMoviesRef(userId), String(tmdbId));
	const tRef = doc(trackingRef(userId), showDocId(tmdbId, MediaType.MOVIE));
	const now = serverTimestamp();

	if (to > from) {
		const delta = to - from;
		const minutes = runtime * delta;
		const batch = writeBatch(db);
		batch.set(
			movieRef,
			{ tmdbId, runtime, watchCount: increment(delta), lastWatchedAt: now },
			{ merge: true },
		);
		batch.set(
			userRef(userId),
			{ stats: { moviesWatched: increment(delta), totalMinutes: increment(minutes) } },
			{ merge: true },
		);
		batch.set(
			tRef,
			{
				status: WatchStatus.COMPLETED,
				lastWatchedAt: now,
				priorityDate: now,
				...historyOnWatch(minutes, delta),
			},
			{ merge: true },
		);
		await batch.commit();
		emitHistoryChange({
			userId,
			tmdbId,
			mediaType: MediaType.MOVIE,
			minutesDelta: minutes,
			playsDelta: delta,
			watched: true,
			status: WatchStatus.COMPLETED,
		});
		return to;
	}

	// Down: off the real count (a cached one can be stale — trusting it deleted watches)
	const result = await runTransaction(db, async (tx) => {
		const snap = await tx.get(movieRef);
		const actual = (snap.data()?.watchCount as number | undefined) ?? 0;
		const final = Math.max(0, actual - (from - to));
		const removed = actual - final;
		if (removed <= 0) return { final: actual, removed: 0 };
		if (final <= 0) tx.delete(movieRef);
		else tx.update(movieRef, { watchCount: final });
		tx.set(
			userRef(userId),
			{
				stats: { moviesWatched: increment(-removed), totalMinutes: increment(-runtime * removed) },
			},
			{ merge: true },
		);
		tx.set(
			tRef,
			final <= 0
				? { status: WatchStatus.WATCHING, priorityDate: Timestamp.now(), ...historyCleared() }
				: historyOnUnwatch(runtime * removed, removed),
			{ merge: true },
		);
		return { final, removed };
	});
	if (result.removed > 0) {
		emitHistoryChange(
			result.final <= 0
				? { userId, tmdbId, mediaType: MediaType.MOVIE, cleared: true }
				: {
						userId,
						tmdbId,
						mediaType: MediaType.MOVIE,
						minutesDelta: -runtime * result.removed,
						playsDelta: -result.removed,
					},
		);
	}
	return result.final;
}

export async function unmarkMovieWatched(
	userId: string,
	tmdbId: number,
	runtime: number,
): Promise<void> {
	runtime = await resolveMovieRuntime(tmdbId, runtime);
	const batch = writeBatch(db);
	const movieRef = doc(watchedMoviesRef(userId), String(tmdbId));

	batch.delete(movieRef);
	batch.set(
		userRef(userId),
		{
			stats: {
				moviesWatched: increment(-1),
				totalMinutes: increment(-(runtime || 0)),
			},
		},
		{ merge: true },
	);
	// Revert tracking status so UI shows "Mark as Watched" instead of "Watched ✓"
	batch.set(
		doc(trackingRef(userId), showDocId(tmdbId, MediaType.MOVIE)),
		{
			status: WatchStatus.WATCHING,
			priorityDate: Timestamp.now(),
			...historyCleared(),
		},
		{ merge: true },
	);

	await batch.commit();
	emitHistoryChange({ userId, tmdbId, mediaType: MediaType.MOVIE, cleared: true });
}

/** Add movie to tracking + mark as watched in one batch (1 write round-trip). */
export async function addAndMarkMovieWatched(
	userId: string,
	tmdbId: number,
	runtime: number,
	meta?: { title?: string; posterPath?: string | null },
): Promise<void> {
	runtime = await resolveMovieRuntime(tmdbId, runtime);
	const docId = showDocId(tmdbId, MediaType.MOVIE);
	const tRef = doc(trackingRef(userId), docId);
	const movieRef = doc(watchedMoviesRef(userId), String(tmdbId));
	const now = Timestamp.now();

	const existingDoc = await getDoc(tRef);
	const alreadyTracked = existingDoc.exists();

	const batch = writeBatch(db);
	batch.set(tRef, {
		tmdbId,
		mediaType: MediaType.MOVIE,
		status: WatchStatus.COMPLETED,
		nextEpisode: null,
		nextEpisodeName: null,
		nextEpisodeAirDate: null,
		rewatchCount: 0,
		addedAt: now,
		lastWatchedAt: now,
		priorityDate: now,
		releaseDate: null,
		...(meta?.title ? { title: meta.title } : {}),
		...(meta?.posterPath ? { posterPath: meta.posterPath } : {}),
		...historyOnWatch(runtime || 0, 1, now),
	});
	batch.set(
		movieRef,
		{
			tmdbId,
			lastWatchedAt: now,
			runtime: runtime || 0,
			watchCount: increment(1),
		},
		{ merge: true },
	);
	batch.set(
		userRef(userId),
		{
			stats: {
				...(!alreadyTracked ? { showsTracking: increment(1) } : {}),
				moviesWatched: increment(1),
				totalMinutes: increment(runtime || 0),
			},
		},
		{ merge: true },
	);
	await batch.commit();
	// New title → not cached yet → the history store fetches this one doc
	emitHistoryChange({
		userId,
		tmdbId,
		mediaType: MediaType.MOVIE,
		watched: true,
		minutesDelta: runtime || 0,
		playsDelta: 1,
		status: WatchStatus.COMPLETED,
	});

	// Background: ensure catalog exists (its response feeds a background catalog fill)
	const addShow = callCF(CloudFunction.ADD_SHOW, { tmdbId, mediaType: MediaType.MOVIE });
	shareCatalogCreate(tmdbId, MediaType.MOVIE, addShow);
	addShow.catch(() => {});
}

// --- Season batch mark (Cloud Function) ---

export async function markSeasonWatchedCF(
	userId: string,
	tmdbId: number,
	seasonNumber: number,
	episodes: Array<{ episodeNumber: number; name: string; runtime: number }>,
	nextEpisode: { season: number; episode: number } | null,
	isShowComplete: boolean,
	nextEpisodeName: string | null = null,
	nextEpisodeAirDate: string | null = null,
	opts: TrackingWriteOpts = {},
): Promise<void> {
	const BATCH_SIZE = 100;
	const {
		skipTracking = false,
		status,
		incrementRewatch = false,
		rewatchCount,
		endOffsetMs = 0,
	} = opts;

	try {
		if (episodes.length <= BATCH_SIZE) {
			await callCF(CloudFunction.MARK_SEASON_WATCHED, {
				tmdbId,
				seasonNumber,
				episodes,
				nextEpisode,
				nextEpisodeName,
				nextEpisodeAirDate,
				isShowComplete,
				// Rewatch status/count + "don't move the pointer" — same as the chunked path
				skipTracking,
				status,
				incrementRewatch,
				rewatchCount,
				endOffsetMs,
			});
		} else {
			// Batch into chunks of 100 — only last chunk updates tracking doc. Chunks lay end to
			// end, the last ending where this whole batch should
			const chunks: (typeof episodes)[] = [];
			for (let i = 0; i < episodes.length; i += BATCH_SIZE) {
				chunks.push(episodes.slice(i, i + BATCH_SIZE));
			}
			const chunkOffsets = batchEndOffsets(chunks.map((c) => c.map((e) => e.runtime)));
			for (let c = 0; c < chunks.length; c++) {
				const chunk = chunks[c];
				const isLastChunk = c === chunks.length - 1;
				await callCF(CloudFunction.MARK_SEASON_WATCHED, {
					tmdbId,
					seasonNumber,
					episodes: chunk,
					nextEpisode: isLastChunk ? nextEpisode : null,
					nextEpisodeName: isLastChunk ? nextEpisodeName : null,
					nextEpisodeAirDate: isLastChunk ? nextEpisodeAirDate : null,
					isShowComplete: isLastChunk ? isShowComplete : false,
					skipTracking: isLastChunk ? skipTracking : true,
					status: isLastChunk ? status : undefined,
					incrementRewatch: isLastChunk ? incrementRewatch : false,
					rewatchCount: isLastChunk ? rewatchCount : undefined,
					endOffsetMs: endOffsetMs + chunkOffsets[c],
				});
			}
		}
	} catch (err: any) {
		throw new Error(getCallableErrorMessage(err), { cause: err });
	}
	emitHistoryChange({
		userId,
		tmdbId,
		mediaType: MediaType.TV,
		watched: true,
		minutesDelta: episodes.reduce((sum, e) => sum + (e.runtime || 0), 0),
		playsDelta: episodes.length,
		lastEpisode: {
			season: seasonNumber,
			episode: Math.max(...episodes.map((e) => e.episodeNumber)),
		},
		...(skipTracking
			? {}
			: {
					nextEpisode,
					status: status ?? (isShowComplete ? WatchStatus.COMPLETED : undefined),
					...(typeof rewatchCount === "number"
						? { rewatchCount }
						: { rewatchDelta: incrementRewatch ? 1 : 0 }),
				}),
	});
}

// Keep backward-compatible aliases during transition
/** @deprecated Use addToTracking */
export const addToWatchlist = addToTracking as any;
/** @deprecated Use removeFromTracking */
export const removeFromWatchlist = removeFromTracking as any;

export {
	db,
	trackingRef,
	trackingRef as watchlistRef,
	watchedEpisodesRef,
	watchedMoviesRef,
	userRef,
};
