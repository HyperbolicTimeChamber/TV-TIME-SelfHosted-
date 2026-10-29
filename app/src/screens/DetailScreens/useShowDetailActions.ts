import { useCallback, useEffect, useMemo, useState } from "react";
import { getFirestore, doc, onSnapshot, Timestamp } from "@react-native-firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import {
	useShowDetails,
	useShowWatchedEpisodes,
	useUpcomingMutations,
	removeShowFromCalendarGlobal,
	addMovieToCalendarGlobal,
	incrementDailyWatch,
	decrementDailyWatch,
	getCachedCatalogShow,
	cacheCatalogShows,
	catalogFromShowDetails,
	insertWatchedMovieCache,
} from "../../hooks";
import { useAuthStore } from "../../stores";
import {
	addToTracking,
	removeFromTracking,
	startRewatch,
	resumeWatching,
	resumeRewatch,
	restartWatching,
	stopWatching,
	markMovieWatched,
	writeMovieWatchCount,
	addAndMarkMovieWatched,
} from "../../services";
import { shouldShowUnreleasedModal } from "../../services/unreleasedModalPref";
import {
	emitShowAdded,
	emitShowRemoved,
	emitShowCompleted,
	showDocId,
	todayStr,
	isIncompleteCatalog,
} from "../../utils";
import {
	WatchStatus,
	MediaType,
	UpcomingEpisode,
	QueryKey,
	WatchedMovie,
	CatalogShow,
	type AddFailure,
} from "../../types";
import { Alert } from "react-native";

/**
 * Last tracking doc each show page's listener saw (uid/docId → doc, null = not tracked). A
 * reopened page starts from it instead of a spinner: on Android RNFirebase serializes every
 * snapshot on one shared executor thread that a server getDoc / getDocs blocks until the
 * network answers, so after a mark (runtime / history reads in flight) the new listener's
 * first snapshot — cached or not — could sit behind them for seconds. 0 reads; the listener
 * still corrects it a moment later.
 */
const lastTracking = new Map<string, any | null>();

/**
 * Show detail state + actions (tracking doc listener, add/remove, movie
 * watch counts, rewatch/resume). Shared by the mobile ShowDetailScreen and the
 * web show page — keep UI out of here.
 */
export function useShowDetailActions(tmdbId: number, mediaType: MediaType) {
	const user = useAuthStore((s) => s.user);
	const {
		data: show,
		isLoading,
		isError,
		error,
		episodesBySeason,
		catalog: pageCatalog,
		refetch,
	} = useShowDetails(tmdbId, mediaType);
	const trackingKey = user?.uid ? `${user.uid}/${showDocId(tmdbId, mediaType)}` : null;
	const [watchlistItem, setWatchlistItem] = useState<any>(() =>
		trackingKey ? (lastTracking.get(trackingKey) ?? null) : null,
	);
	const { episodes: showWatchedEps } = useShowWatchedEpisodes(
		mediaType === MediaType.TV ? user?.uid : undefined,
		tmdbId,
	);
	const [trackingLoading, setTrackingLoading] = useState(
		() => !trackingKey || !lastTracking.has(trackingKey),
	);
	const [adding, setAdding] = useState(false);
	const [addFailure, setAddFailure] = useState<AddFailure | null>(null);
	const [removing, setRemoving] = useState(false);
	const { addShowToUpcoming, removeShowFromUpcoming } = useUpcomingMutations();
	const queryClient = useQueryClient();
	// Fallback count for tracking docs without plays — seeded from the watched movies list
	const [localMovieWatchCount, setMovieWatchCount] = useState(() => {
		if (mediaType !== MediaType.MOVIE || !user?.uid) return 0;
		const cached = queryClient.getQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid]);
		if (!cached?.pages) return 0;
		const found = cached.pages.flatMap((p: any) => p.movies).find((m: any) => m.tmdbId === tmdbId);
		return found?.watchCount ?? 0;
	});
	// The tracking doc's plays is the movie's watch count (marks minus unmarks). The watched
	// movies list above only holds the pages loaded so far, so an older movie opened from
	// Watch History started at 0 there — follow the live tracking doc instead. It's the only
	// source while present: the listener already sees a mark's plays increment (local write),
	// so bumping the local count on top showed rewatch 2 as 3
	const trackedPlays = mediaType === MediaType.MOVIE ? watchlistItem?.plays : undefined;
	const movieWatchCount = typeof trackedPlays === "number" ? trackedPlays : localMovieWatchCount;
	useEffect(() => {
		if (typeof trackedPlays === "number") setMovieWatchCount(trackedPlays);
	}, [trackedPlays]);
	// Full watches of a show: completed = rewatch runs + the first watch; mid / paused
	// rewatch = runs finished so far (same numbers as the Watch History cards)
	const showWatchCount = useMemo(() => {
		if (mediaType !== MediaType.TV || !watchlistItem || showWatchedEps.length === 0) return 0;
		const runs = watchlistItem.rewatchCount ?? 0;
		switch (watchlistItem.status) {
			case WatchStatus.COMPLETED:
				return runs + 1;
			case WatchStatus.REWATCHING:
			case WatchStatus.PAUSED_REWATCH:
				return Math.max(1, runs);
			default:
				return 0;
		}
	}, [mediaType, watchlistItem, showWatchedEps.length]);
	const watchCount = mediaType === MediaType.MOVIE ? movieWatchCount : showWatchCount;
	// Anything watched → no Remove (clear the watch history first)
	const hasStarted =
		mediaType === MediaType.MOVIE
			? movieWatchCount > 0
			: showWatchedEps.length > 0 || (watchlistItem?.plays ?? 0) > 0;
	const [movieSheetVisible, setMovieSheetVisible] = useState(false);
	const [removeModalVisible, setRemoveModalVisible] = useState(false);
	const [pauseModalVisible, setPauseModalVisible] = useState(false);
	const [pausing, setPausing] = useState(false);
	const [removeError, setRemoveError] = useState<string | null>(null);
	const [unreleasedModal, setUnreleasedModal] = useState<{
		title: string;
	} | null>(null);

	useEffect(() => {
		if (!user?.uid) {
			setTrackingLoading(false);
			return;
		}
		const db = getFirestore();
		const trackingDocRef = doc(db, "users", user.uid, "tracking", showDocId(tmdbId, mediaType));

		// Listener only: its first snapshot comes from the local cache when the doc is there, so
		// the page renders right away. A separate getDoc went to the server every open (slow on a
		// bad connection, gating the whole page) and cost an extra read. A page seen before this
		// session renders its last state meanwhile (see lastTracking)
		const key = `${user.uid}/${showDocId(tmdbId, mediaType)}`;
		const known = lastTracking.has(key);
		setWatchlistItem(known ? lastTracking.get(key) : null);
		setTrackingLoading(!known);
		const unsubscribe = onSnapshot(
			trackingDocRef,
			(snap) => {
				const item = snap.exists() ? { id: snap.id, ...snap.data() } : null;
				lastTracking.set(key, item);
				setWatchlistItem(item);
				setTrackingLoading(false);
			},
			() => setTrackingLoading(false),
		);

		return unsubscribe;
	}, [user?.uid, tmdbId, mediaType]);

	const title = show?.name || show?.title || "";
	// Tracked title: share the catalog doc this page already read with the watchlist cache (0
	// extra reads). Without it, a show whose tracking page isn't loaded drew blank Previously
	// Watched rows after a mark from here — the rows look the show up there, not on this page
	const tracked = !!watchlistItem;
	useEffect(() => {
		if (!tracked || !pageCatalog) return;
		const cached = getCachedCatalogShow(tmdbId, mediaType);
		// Keep a complete cached copy; replace a missing / stand-in / seasonless one
		const complete =
			cached &&
			!isIncompleteCatalog(cached) &&
			(mediaType === MediaType.MOVIE || (cached.seasons?.length ?? 0) > 0);
		if (!complete) cacheCatalogShows([pageCatalog]);
	}, [tracked, pageCatalog, tmdbId, mediaType]);
	// TMDB sometimes has no first_air_date for a new show — fall back to the earliest season's
	// air date (the date the season rows show), else the Year stat reads "—"
	const firstSeasonDate =
		(show?.seasons ?? [])
			.filter((s) => s.season_number > 0 && s.air_date)
			.map((s) => s.air_date as string)
			.sort()[0] ?? "";
	const rawDate = show?.first_air_date || show?.release_date || firstSeasonDate;
	const year =
		mediaType === MediaType.MOVIE && rawDate.length >= 10
			? new Date(rawDate + "T00:00:00").toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
					year: "numeric",
				})
			: rawDate.substring(0, 4);

	const directors =
		show?.credits?.crew?.filter((c) => c.job === "Director").map((c) => c.name) ?? [];
	const writers =
		show?.credits?.crew?.filter((c) => c.department === "Writing").map((c) => c.name) ?? [];
	const producers =
		show?.credits?.crew?.filter((c) => c.job === "Producer").map((c) => c.name) ?? [];

	/**
	 * Movie's catalog entry for its watchlist / Previously Watched card: the cached doc when it's
	 * complete, else built from this page's details and put in the shared catalog cache. Run
	 * before the tracking write — its local snapshot then enriches from the cache (no catalog
	 * read, no TMDB heal) instead of rendering a card without poster / year / director.
	 */
	const seedMovieCatalog = useCallback((): CatalogShow | null => {
		if (!show || mediaType !== MediaType.MOVIE) return null;
		const cached = getCachedCatalogShow(tmdbId, MediaType.MOVIE);
		if (cached && !isIncompleteCatalog(cached) && cached.credits) return cached;
		const catalog = catalogFromShowDetails(show, MediaType.MOVIE, cached);
		cacheCatalogShows([catalog]);
		return catalog;
	}, [show, tmdbId, mediaType]);

	/** Show's future episodes into the local upcoming + calendar caches (server docs come from addShow CF) */
	const addFutureEpisodesLocally = useCallback(
		(title: string, poster: string | null) => {
			const today = todayStr();
			const upcomingEps: UpcomingEpisode[] = [];
			for (const [seasonNum, eps] of episodesBySeason) {
				if (seasonNum === 0) continue;
				for (const ep of eps) {
					if (ep.air_date && ep.air_date >= today) {
						upcomingEps.push({
							tmdbShowId: tmdbId,
							showTitle: title,
							posterPath: poster,
							season: seasonNum,
							episode: ep.episode_number,
							episodeTitle: ep.name || "",
							airDate: ep.air_date,
							runtime: ep.runtime ?? null,
							mediaType: MediaType.TV,
						});
					}
				}
			}
			// No ep data → nothing to add; syncCatalog CF fills upcoming later
			if (upcomingEps.length === 0) return;
			addShowToUpcoming(tmdbId, upcomingEps);
			for (const ep of upcomingEps) addMovieToCalendarGlobal(ep);
		},
		[episodesBySeason, tmdbId, addShowToUpcoming],
	);

	const handleAddToWatchlist = useCallback(async () => {
		if (!user?.uid || !show || adding) return;
		setAdding(true);
		try {
			const releaseDate = show.release_date || null;
			const today = todayStr();
			const isUnreleased = mediaType === MediaType.MOVIE && releaseDate && releaseDate > today;

			if (isUnreleased) {
				shouldShowUnreleasedModal(user.uid).then((shouldShow) => {
					if (shouldShow) {
						setUnreleasedModal({ title: show.title || show.name || "" });
					}
				});
			}

			const firstEp = mediaType === MediaType.TV ? episodesBySeason.get(1)?.[0] : undefined;
			const movieCatalog = seedMovieCatalog();

			await addToTracking(user.uid, tmdbId, mediaType, isUnreleased ? releaseDate : null, {
				title: show.title || show.name || "",
				posterPath: show.poster_path || null,
				nextEpisodeName: firstEp?.name || null,
				nextEpisodeAirDate: firstEp?.air_date || null,
			});
			const title = show.title || show.name || "";
			const poster = show.poster_path || null;
			const now = Timestamp.now();
			emitShowAdded({
				id: showDocId(tmdbId, mediaType),
				tmdbId,
				mediaType,
				status: WatchStatus.WATCHING,
				nextEpisode: mediaType === MediaType.TV ? { season: 1, episode: 1 } : null,
				nextEpisodeName: firstEp?.name || null,
				nextEpisodeAirDate: firstEp?.air_date || null,
				rewatchCount: 0,
				addedAt: now,
				lastWatchedAt: now,
				priorityDate: now,
				releaseDate: releaseDate ?? null,
				title,
				posterPath: poster,
				totalEpisodes: 0,
				catalogShow: movieCatalog,
			});
			if (isUnreleased && releaseDate) {
				const movieEp: UpcomingEpisode = {
					tmdbShowId: tmdbId,
					showTitle: title,
					posterPath: poster,
					season: 0,
					episode: 0,
					episodeTitle: title,
					airDate: releaseDate,
					runtime: null,
					mediaType: MediaType.MOVIE,
				};
				addShowToUpcoming(tmdbId, movieEp);
				addMovieToCalendarGlobal(movieEp);
			} else if (mediaType === MediaType.TV) {
				addFutureEpisodesLocally(title, poster);
			}
			setAddFailure(null);
		} catch (err: any) {
			console.error("addToTracking failed:", err);
			// In-app popup, not a native Alert: an Alert raised while the app is backgrounded
			// only surfaces the next time it's opened, with no idea what it refers to
			setAddFailure({
				title: show.title || show.name || "",
				tmdbId,
				mediaType,
				backdropPath: show.backdrop_path ?? null,
				logoPath: null,
				message: err.message || "Failed to add to watchlist.",
			});
		} finally {
			setAdding(false);
		}
	}, [
		user?.uid,
		show,
		tmdbId,
		mediaType,
		adding,
		addShowToUpcoming,
		episodesBySeason,
		addFutureEpisodesLocally,
		seedMovieCatalog,
	]);

	const handleRemove = useCallback(() => {
		if (!user?.uid || removing) return;
		setRemoveError(null);
		setRemoveModalVisible(true);
	}, [user?.uid, removing]);

	const handleConfirmRemove = useCallback(async () => {
		if (!user?.uid || removing) return;
		setRemoving(true);
		setRemoveError(null);
		try {
			await removeFromTracking(user.uid, tmdbId, mediaType);
			removeShowFromUpcoming(tmdbId);
			removeShowFromCalendarGlobal(tmdbId);
			emitShowRemoved(tmdbId);
			setRemoveModalVisible(false);
		} catch (err: any) {
			console.error("removeFromTracking failed:", err);
			setRemoveError(err.message || "Failed to remove. Please try again.");
		} finally {
			setRemoving(false);
		}
	}, [user?.uid, tmdbId, removing, removeShowFromUpcoming]);

	// Watching → paused, rewatching → paused rewatch (same as the watchlist's Pause); the
	// button then reads "Resume" / "Resume Rewatch"
	const handleConfirmPause = useCallback(async () => {
		const status = watchlistItem?.status;
		if (
			!user?.uid ||
			pausing ||
			(status !== WatchStatus.WATCHING && status !== WatchStatus.REWATCHING)
		)
			return;
		setPausing(true);
		try {
			await stopWatching(user.uid, tmdbId, status, mediaType);
			removeShowFromUpcoming(tmdbId);
			removeShowFromCalendarGlobal(tmdbId);
			emitShowRemoved(tmdbId);
			setPauseModalVisible(false);
		} catch (err: any) {
			Alert.alert("Error", err.message || "Failed to pause.");
		} finally {
			setPausing(false);
		}
	}, [user?.uid, pausing, watchlistItem?.status, tmdbId, mediaType, removeShowFromUpcoming]);

	const handleMarkMovieWatched = useCallback(async () => {
		if (!user?.uid || !show || adding) return;
		setAdding(true);
		try {
			const movieTitle = show.title || show.name || "";
			const moviePoster = show.poster_path || null;
			const movieCatalog = seedMovieCatalog();
			if (!watchlistItem) {
				await addAndMarkMovieWatched(user.uid, tmdbId, show.runtime ?? 0, {
					title: movieTitle,
					posterPath: moviePoster,
				});
				// Notify trackedIds so search card shows ✓
				emitShowAdded({
					id: showDocId(tmdbId, MediaType.MOVIE),
					tmdbId,
					mediaType: MediaType.MOVIE,
					status: WatchStatus.COMPLETED,
					nextEpisode: null,
					nextEpisodeName: null,
					nextEpisodeAirDate: null,
					rewatchCount: 0,
					addedAt: Timestamp.now(),
					lastWatchedAt: Timestamp.now(),
					priorityDate: Timestamp.now(),
					releaseDate: show.release_date ?? null,
					title: movieTitle,
					posterPath: moviePoster,
					totalEpisodes: 0,
					catalogShow: movieCatalog,
				});
			} else {
				await markMovieWatched(user.uid, tmdbId, show.runtime ?? 0);
			}
			// Update query cache directly — no refetch. Rewatch bumps the existing row
			// (prepending a second copy left a duplicate stuck at watchCount 1)
			const now = Timestamp.now();
			insertWatchedMovieCache(queryClient, user.uid, {
				id: String(tmdbId),
				tmdbId,
				watchedAt: now,
				lastWatchedAt: now,
				runtime: show.runtime ?? 0,
				watchCount: 1,
				title: movieTitle,
				posterPath: moviePoster,
				releaseDate: movieCatalog?.releaseDate ?? show.release_date ?? null,
			} as WatchedMovie);
			// Only feeds the count when the tracking doc has no plays (else the listener does)
			setMovieWatchCount((c: number) => c + 1);
			incrementDailyWatch("movie");
			emitShowCompleted({
				tmdbId,
				mediaType: MediaType.MOVIE,
				title: movieTitle,
				posterPath: moviePoster,
				genres: movieCatalog?.genres ?? [],
			});
		} catch (err: any) {
			Alert.alert("Error", err.message || "Failed to mark movie as watched.");
		} finally {
			setAdding(false);
		}
	}, [user?.uid, show, tmdbId, watchlistItem, adding, queryClient, seedMovieCatalog]);

	const handleResumeOrRewatch = useCallback(async () => {
		if (!user?.uid) return;
		if (mediaType === MediaType.MOVIE && watchlistItem?.status === WatchStatus.COMPLETED) {
			await handleMarkMovieWatched();
			return;
		}
		const paused = watchlistItem?.status === WatchStatus.PAUSED;
		if (paused || watchlistItem?.status === WatchStatus.PAUSED_REWATCH) {
			await (paused ? resumeWatching : resumeRewatch)(user.uid, tmdbId, mediaType);
			// Stop removed the show from the local watchlist + upcoming; put it back
			// (the tracking listener alone misses it — see stopWatching / removeItem)
			const title = show?.title || show?.name || "";
			const poster = show?.poster_path || null;
			emitShowAdded({
				...watchlistItem,
				id: showDocId(tmdbId, mediaType),
				tmdbId,
				mediaType,
				status: paused ? WatchStatus.WATCHING : WatchStatus.REWATCHING,
				priorityDate: Timestamp.now(),
				title,
				posterPath: poster,
				totalEpisodes: 0,
				catalogShow: getCachedCatalogShow(tmdbId, mediaType),
			});
			if (mediaType === MediaType.TV) addFutureEpisodesLocally(title, poster);
		} else if (mediaType === MediaType.TV && showWatchedEps.length === 0) {
			// COMPLETED without a single watched episode — bad state, start fresh instead of rewatch
			await restartWatching(user.uid, tmdbId);
		} else {
			await startRewatch(user.uid, tmdbId, mediaType);
		}
	}, [
		user?.uid,
		tmdbId,
		watchlistItem,
		mediaType,
		handleMarkMovieWatched,
		showWatchedEps.length,
		show,
		addFutureEpisodesLocally,
	]);

	/** Watch count sheet settled on a new count — one write, caches set to the new number */
	const handleMovieWatchCountChange = useCallback(
		async (from: number, to: number) => {
			if (!user?.uid || !show || from === to) return;
			const uid = user.uid;
			const movieTitle = show.title || show.name || "";
			const moviePoster = show.poster_path || null;
			const movieCatalog = from === 0 ? seedMovieCatalog() : null;
			setMovieWatchCount(to);
			try {
				await writeMovieWatchCount(uid, tmdbId, show.runtime ?? 0, from, to);
			} catch (err: any) {
				setMovieWatchCount(from);
				Alert.alert("Error", err.message || "Failed to update watch count.");
				return;
			}
			// Rows already listed take the new count (dropped at 0)
			queryClient.setQueryData<any>([QueryKey.WATCHED_MOVIES, uid], (old: any) => {
				if (!old?.pages) return old;
				return {
					...old,
					pages: old.pages.map((p: any) => ({
						...p,
						movies: p.movies.flatMap((m: any) =>
							m.tmdbId !== tmdbId ? [m] : to > 0 ? [{ ...m, watchCount: to }] : [],
						),
					})),
				};
			});
			if (from === 0 && to > 0) {
				const now = Timestamp.now();
				// First watch → the row isn't listed yet; insert it at the requested count
				insertWatchedMovieCache(queryClient, uid, {
					id: String(tmdbId),
					tmdbId,
					watchedAt: now,
					lastWatchedAt: now,
					runtime: show.runtime ?? 0,
					watchCount: to,
					title: movieTitle,
					posterPath: moviePoster,
					releaseDate: movieCatalog?.releaseDate ?? show.release_date ?? null,
				} as WatchedMovie);
				emitShowCompleted({
					tmdbId,
					mediaType: MediaType.MOVIE,
					title: movieTitle,
					posterPath: moviePoster,
					genres: movieCatalog?.genres ?? [],
				});
			}
			for (let i = 0; i < Math.abs(to - from); i++) {
				if (to > from) incrementDailyWatch("movie");
				else decrementDailyWatch("movie");
			}
		},
		[user?.uid, show, tmdbId, queryClient, seedMovieCatalog],
	);

	const seasonLayout = useMemo(
		() =>
			(show?.seasons ?? [])
				.filter((s) => s.season_number > 0)
				.map((s) => ({
					season: s.season_number,
					episodeCount: episodesBySeason.get(s.season_number)?.length ?? s.episode_count ?? 0,
				})),
		[show?.seasons, episodesBySeason],
	);

	return {
		refetch,
		user,
		show,
		isLoading,
		isError,
		error,
		episodesBySeason,
		watchlistItem,
		showWatchedEps,
		trackingLoading,
		adding,
		addFailure,
		setAddFailure,
		removing,
		movieWatchCount,
		showWatchCount,
		watchCount,
		hasStarted,
		movieSheetVisible,
		setMovieSheetVisible,
		removeModalVisible,
		setRemoveModalVisible,
		pauseModalVisible,
		setPauseModalVisible,
		pausing,
		handleConfirmPause,
		removeError,
		setRemoveError,
		unreleasedModal,
		setUnreleasedModal,
		title,
		year,
		directors,
		writers,
		producers,
		handleAddToWatchlist,
		handleRemove,
		handleConfirmRemove,
		handleMarkMovieWatched,
		handleResumeOrRewatch,
		handleMovieWatchCountChange,
		seasonLayout,
	};
}
