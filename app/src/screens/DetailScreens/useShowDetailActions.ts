import { useCallback, useEffect, useMemo, useState } from "react";
import { getFirestore, doc, getDoc, onSnapshot, Timestamp } from "@react-native-firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import {
	useShowDetails,
	useShowWatchedEpisodes,
	useUpcomingMutations,
	removeShowFromCalendarGlobal,
	addMovieToCalendarGlobal,
	incrementDailyWatch,
	decrementDailyWatch,
} from "../../hooks";
import { useAuthStore } from "../../stores";
import {
	addToTracking,
	removeFromTracking,
	startRewatch,
	resumeWatching,
	resumeRewatch,
	restartWatching,
	markMovieWatched,
	decrementMovieWatchCount,
	unmarkMovieWatched,
	addAndMarkMovieWatched,
} from "../../services";
import { shouldShowUnreleasedModal } from "../../services/unreleasedModalPref";
import {
	emitShowAdded,
	emitShowRemoved,
	emitShowCompleted,
	showDocId,
	todayStr,
} from "../../utils";
import {
	WatchStatus,
	MediaType,
	UpcomingEpisode,
	QueryKey,
	WatchedMovie,
	WatchAction,
} from "../../types";
import { Alert } from "react-native";

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
		refetch,
	} = useShowDetails(tmdbId, mediaType);
	const [watchlistItem, setWatchlistItem] = useState<any>(null);
	const { episodes: showWatchedEps } = useShowWatchedEpisodes(
		mediaType === MediaType.TV ? user?.uid : undefined,
		tmdbId,
	);
	const [trackingLoading, setTrackingLoading] = useState(true);
	const [adding, setAdding] = useState(false);
	const [removing, setRemoving] = useState(false);
	const { addShowToUpcoming, removeShowFromUpcoming } = useUpcomingMutations();
	const queryClient = useQueryClient();
	const [movieWatchCount, setMovieWatchCount] = useState(() => {
		if (mediaType !== MediaType.MOVIE || !user?.uid) return 0;
		const cached = queryClient.getQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid]);
		if (!cached?.pages) return 0;
		const found = cached.pages.flatMap((p: any) => p.movies).find((m: any) => m.tmdbId === tmdbId);
		return found?.watchCount ?? 0;
	});
	const [movieSheetVisible, setMovieSheetVisible] = useState(false);
	const [removeModalVisible, setRemoveModalVisible] = useState(false);
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

		// One-time read + listener for real-time updates after add/remove
		let cancelled = false;
		getDoc(trackingDocRef)
			.then((snap) => {
				if (cancelled) return;
				if (snap.exists()) {
					setWatchlistItem({ id: snap.id, ...snap.data() });
				} else {
					setWatchlistItem(null);
				}
				setTrackingLoading(false);
			})
			.catch(() => {
				if (!cancelled) setTrackingLoading(false);
			});

		// Listener for live updates (add/remove while on screen)
		const unsubscribe = onSnapshot(trackingDocRef, (snap) => {
			if (snap.exists()) {
				setWatchlistItem({ id: snap.id, ...snap.data() });
			} else {
				setWatchlistItem(null);
			}
		});

		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [user?.uid, tmdbId]);

	const title = show?.name || show?.title || "";
	const rawDate = show?.first_air_date || show?.release_date || "";
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

			// Get first episode info for TV shows
			const firstEp = mediaType === MediaType.TV ? episodesBySeason.get(1)?.[0] : undefined;

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
				catalogShow: null,
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
				if (upcomingEps.length > 0) {
					addShowToUpcoming(tmdbId, upcomingEps);
					for (const ep of upcomingEps) {
						addMovieToCalendarGlobal(ep);
					}
				}
				// No ep data → don't add to upcoming. syncCatalog CF will populate later.
			}
		} catch (err: any) {
			console.error("addToTracking failed:", err);
			Alert.alert("Error", err.message || "Failed to add to watchlist.");
		} finally {
			setAdding(false);
		}
	}, [user?.uid, show, tmdbId, mediaType, adding, addShowToUpcoming, episodesBySeason]);

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

	const handleMarkMovieWatched = useCallback(async () => {
		if (!user?.uid || !show || adding) return;
		setAdding(true);
		try {
			const movieTitle = show.title || show.name || "";
			const moviePoster = show.poster_path || null;
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
					catalogShow: null,
				});
			} else {
				await markMovieWatched(user.uid, tmdbId, show.runtime ?? 0);
			}
			// Update query cache directly — no refetch
			const now = Timestamp.now();
			queryClient.setQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid], (old: any) => {
				if (!old?.pages) return old;
				const newMovie = {
					id: `${tmdbId}_watched`,
					tmdbId,
					watchedAt: now,
					lastWatchedAt: now,
					runtime: show.runtime ?? 0,
					watchCount: 1,
					title: movieTitle,
					posterPath: moviePoster,
				} as WatchedMovie;
				const firstPage = old.pages[0];
				return {
					...old,
					pages: [{ ...firstPage, movies: [newMovie, ...firstPage.movies] }, ...old.pages.slice(1)],
				};
			});
			setMovieWatchCount((c: number) => c + 1);
			incrementDailyWatch("movie");
			emitShowCompleted({
				tmdbId,
				mediaType: MediaType.MOVIE,
				title: movieTitle,
				posterPath: moviePoster,
				genres: [],
			});
		} catch (err: any) {
			Alert.alert("Error", err.message || "Failed to mark movie as watched.");
		} finally {
			setAdding(false);
		}
	}, [user?.uid, show, tmdbId, watchlistItem, adding, queryClient]);

	const handleResumeOrRewatch = useCallback(async () => {
		if (!user?.uid) return;
		if (mediaType === MediaType.MOVIE && watchlistItem?.status === WatchStatus.COMPLETED) {
			await handleMarkMovieWatched();
			return;
		}
		if (watchlistItem?.status === WatchStatus.PAUSED) {
			await resumeWatching(user.uid, tmdbId, mediaType);
		} else if (watchlistItem?.status === WatchStatus.PAUSED_REWATCH) {
			await resumeRewatch(user.uid, tmdbId, mediaType);
		} else if (mediaType === MediaType.TV && showWatchedEps.length === 0) {
			// COMPLETED without a single watched episode — bad state, start fresh instead of rewatch
			await restartWatching(user.uid, tmdbId);
		} else {
			await startRewatch(user.uid, tmdbId, mediaType);
		}
	}, [
		user?.uid,
		tmdbId,
		watchlistItem?.status,
		mediaType,
		handleMarkMovieWatched,
		showWatchedEps.length,
	]);

	const handleMovieSheetAction = useCallback(
		async (action: WatchAction) => {
			if (!user?.uid || !show) return;
			const runtime = show.runtime ?? 0;
			if (action === "rewatch") {
				await handleMarkMovieWatched();
			} else if (action === "watched_once_less") {
				await decrementMovieWatchCount(user.uid, tmdbId, runtime, movieWatchCount);
				if (movieWatchCount <= 1) {
					// Fully unwatched — remove from cache
					queryClient.setQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid], (old: any) => {
						if (!old?.pages) return old;
						return {
							...old,
							pages: old.pages.map((p: any) => ({
								...p,
								movies: p.movies.filter((m: any) => m.tmdbId !== tmdbId),
							})),
						};
					});
					setMovieWatchCount(0);
				} else {
					queryClient.setQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid], (old: any) => {
						if (!old?.pages) return old;
						return {
							...old,
							pages: old.pages.map((p: any) => ({
								...p,
								movies: p.movies.map((m: any) =>
									m.tmdbId === tmdbId ? { ...m, watchCount: (m.watchCount || 1) - 1 } : m,
								),
							})),
						};
					});
					setMovieWatchCount((c: number) => c - 1);
				}
				decrementDailyWatch("movie");
			} else if (action === "not_watched") {
				await unmarkMovieWatched(user.uid, tmdbId, runtime);
				queryClient.setQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid], (old: any) => {
					if (!old?.pages) return old;
					return {
						...old,
						pages: old.pages.map((p: any) => ({
							...p,
							movies: p.movies.filter((m: any) => m.tmdbId !== tmdbId),
						})),
					};
				});
				setMovieWatchCount(0);
				decrementDailyWatch("movie");
			}
		},
		[user?.uid, show, tmdbId, movieWatchCount, queryClient, handleMarkMovieWatched],
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
		removing,
		movieWatchCount,
		movieSheetVisible,
		setMovieSheetVisible,
		removeModalVisible,
		setRemoveModalVisible,
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
		handleMovieSheetAction,
		seasonLayout,
	};
}
