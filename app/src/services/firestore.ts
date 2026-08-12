import {
	getFirestore,
	collection,
	doc,
	getDoc,
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
import { showDocId } from "../utils/docId";
import { trackApi } from "./analytics";

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
		return { id: showDoc.id, ...showDoc.data() } as unknown as CatalogShow;
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
	const callAddShow = () =>
		callCF(CloudFunction.ADD_SHOW, { tmdbId, mediaType });
	callAddShow().catch(() =>
		callAddShow().catch(async () => {
			// Both attempts failed — undo the local add
			const rollback = writeBatch(db);
			rollback.delete(tRef);
			if (!alreadyTracked) {
				rollback.set(userRef(userId), { stats: { showsTracking: increment(-1) } }, { merge: true });
			}
			await rollback.commit().catch(() => {});
			// Emit error for UI to pick up
			addTrackingErrorListeners.forEach((fn) => fn(tmdbId, meta?.title || `Show #${tmdbId}`));
		}),
	);
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
	});

	// Clean upcoming subcollection for this show (fire-and-forget)
	const upcomingCol = collection(doc(db, "users", userId), "upcoming");
	getDocs(query(upcomingCol, where("tmdbShowId", "==", tmdbId)))
		.then(async (snap) => {
			for (const d of snap.docs) {
				await deleteDoc(d.ref);
			}
		})
		.catch(() => {});
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
) {
	const docId = episodeDocId(tmdbShowId, season, episode);
	const epRef = doc(watchedEpisodesRef(userId), docId);

	await runTransaction(db, async (tx) => {
		const existing = await tx.get(epRef);
		const isRewatch = existing.exists();

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

		if (!isRewatch) {
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
		}

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
			tx.update(doc(trackingRef(userId), showDocId(tmdbShowId, MediaType.TV)), trackingUpdate);
		}
	});
}

export async function unmarkEpisodeWatched(
	userId: string,
	tmdbShowId: number,
	season: number,
	episode: number,
	runtime: number,
	episodeName?: string | null,
	nextEpisodeAirDate?: string | null,
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
		},
		{ merge: true },
	);
	await batch.commit();
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
	if (willDelete) {
		batch.set(
			doc(trackingRef(userId), showDocId(tmdbShowId, MediaType.TV)),
			{
				nextEpisode: { season, episode },
				nextEpisodeName: episodeName || null,
				nextEpisodeAirDate: nextEpisodeAirDate || null,
				status: WatchStatus.WATCHING,
				priorityDate: Timestamp.now(),
			},
			{ merge: true },
		);
	}

	await batch.commit();
}

export async function unmarkSeasonWatched(
	userId: string,
	tmdbShowId: number,
	episodes: Array<{ season: number; episode: number; runtime: number }>,
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
	let totalRuntime = 0;
	let deleteCount = 0;

	for (const d of allSeasonDocs.docs) {
		batch.delete(d.ref);
		totalRuntime += d.data().runtime || 0;
		deleteCount++;
	}

	if (deleteCount === 0) return;

	batch.set(
		userRef(userId),
		{
			stats: {
				episodesWatched: increment(-deleteCount),
				totalMinutes: increment(-totalRuntime),
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
		},
		{ merge: true },
	);

	await batch.commit();
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
	}

	await batch.commit();
}

export async function startRewatch(userId: string, tmdbId: number, mediaType: MediaType) {
	const docId = showDocId(tmdbId, mediaType);
	await updateDoc(doc(trackingRef(userId), docId), {
		status: WatchStatus.REWATCHING,
		rewatchCount: increment(1),
		nextEpisode: { season: 1, episode: 1 },
		lastWatchedAt: serverTimestamp(),
		priorityDate: serverTimestamp(),
	});
}

export async function resumeWatching(userId: string, tmdbId: number, mediaType: MediaType) {
	const docId = showDocId(tmdbId, mediaType);
	await updateDoc(doc(trackingRef(userId), docId), {
		status: WatchStatus.WATCHING,
	});
}

export async function resumeRewatch(userId: string, tmdbId: number, mediaType: MediaType) {
	const docId = showDocId(tmdbId, mediaType);
	await updateDoc(doc(trackingRef(userId), docId), {
		status: WatchStatus.REWATCHING,
	});
}

export async function markMovieWatched(
	userId: string,
	tmdbId: number,
	runtime: number,
): Promise<void> {
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
		},
		{ merge: true },
	);

	batch.set(
		userRef(userId),
		{
			stats: {
				moviesWatched: increment(1),
				totalMinutes: increment(Math.round(runtime / 60)),
			},
		},
		{ merge: true },
	);

	await batch.commit();
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
				totalMinutes: increment(-Math.round(runtime / 60)),
			},
		},
		{ merge: true },
	);
	// When fully unwatched, revert tracking status
	if (willDelete) {
		batch.set(
			doc(trackingRef(userId), showDocId(tmdbId, MediaType.MOVIE)),
			{
				status: WatchStatus.WATCHING,
				priorityDate: Timestamp.now(),
			},
			{ merge: true },
		);
	}

	await batch.commit();
}

export async function unmarkMovieWatched(
	userId: string,
	tmdbId: number,
	runtime: number,
): Promise<void> {
	const batch = writeBatch(db);
	const movieRef = doc(watchedMoviesRef(userId), String(tmdbId));

	batch.delete(movieRef);
	batch.set(
		userRef(userId),
		{
			stats: {
				moviesWatched: increment(-1),
				totalMinutes: increment(-Math.round(runtime / 60)),
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
		},
		{ merge: true },
	);

	await batch.commit();
}

/** Add movie to tracking + mark as watched in one batch (1 write round-trip). */
export async function addAndMarkMovieWatched(
	userId: string,
	tmdbId: number,
	runtime: number,
	meta?: { title?: string; posterPath?: string | null },
): Promise<void> {
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
				totalMinutes: increment(Math.round(runtime / 60)),
			},
		},
		{ merge: true },
	);
	await batch.commit();

	// Background: ensure catalog exists
	callCF(CloudFunction.ADD_SHOW, { tmdbId, mediaType: MediaType.MOVIE }).catch(() => {});
}

// --- Season batch mark (Cloud Function) ---

export async function markSeasonWatchedCF(
	tmdbId: number,
	seasonNumber: number,
	episodes: Array<{ episodeNumber: number; name: string; runtime: number }>,
	nextEpisode: { season: number; episode: number } | null,
	isShowComplete: boolean,
	nextEpisodeName: string | null = null,
	nextEpisodeAirDate: string | null = null,
): Promise<void> {
	const BATCH_SIZE = 100;

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
			});
		} else {
			// Batch into chunks of 100 — only last chunk updates tracking doc
			for (let i = 0; i < episodes.length; i += BATCH_SIZE) {
				const chunk = episodes.slice(i, i + BATCH_SIZE);
				const isLastChunk = i + BATCH_SIZE >= episodes.length;
				await callCF(CloudFunction.MARK_SEASON_WATCHED, {
					tmdbId,
					seasonNumber,
					episodes: chunk,
					nextEpisode: isLastChunk ? nextEpisode : null,
					nextEpisodeName: isLastChunk ? nextEpisodeName : null,
					nextEpisodeAirDate: isLastChunk ? nextEpisodeAirDate : null,
					isShowComplete: isLastChunk ? isShowComplete : false,
				});
			}
		}
	} catch (err: any) {
		throw new Error(getCallableErrorMessage(err), { cause: err });
	}
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
