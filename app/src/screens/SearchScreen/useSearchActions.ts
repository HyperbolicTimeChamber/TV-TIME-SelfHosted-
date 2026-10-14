import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getFirestore, doc, updateDoc, Timestamp } from "@react-native-firebase/firestore";
import { shouldShowUnreleasedModal } from "../../services/unreleasedModalPref";
import {
	useTrackedIds,
	useUpcomingMutations,
	removeShowFromCalendarGlobal,
	addMovieToCalendarGlobal,
	incrementDailyWatch,
} from "../../hooks";
import { useAuthStore } from "../../stores";
import {
	addToTracking,
	removeFromTracking,
	addAndMarkMovieWatched,
	getHighestWatchedEpisode,
} from "../../services";
import {
	showDocId,
	emitShowAdded,
	emitShowRemoved,
	emitShowCompleted,
	todayStr,
} from "../../utils";
import { getCachedCatalogShow } from "../../hooks/useWatchlist";
import {
	TMDBShow,
	MediaType,
	QueryKey,
	WatchStatus,
	WatchedMovie,
	UpcomingEpisode,
} from "../../types";
import { Alert } from "react-native";
import { fetchFirstEpisodeInfo, buildOptimisticItem } from "./helpers";

/**
 * Search add/remove/resume logic, shared by the mobile SearchScreen and the web
 * search page (web imports this file directly) — keep UI out of here.
 */
export function useSearchActions() {
	const user = useAuthStore((s) => s.user);
	const apiKey = useAuthStore((s) => s.appTmdbApiKey);
	const queryClient = useQueryClient();
	const trackedIds = useTrackedIds(user?.uid);

	const [addingIds, setAddingIds] = useState<Set<number>>(new Set());
	const [movieModal, setMovieModal] = useState<TMDBShow | null>(null);
	const [removeModal, setRemoveModal] = useState<TMDBShow | null>(null);
	const [removing, setRemoving] = useState(false);
	const [removeError, setRemoveError] = useState<string | null>(null);
	const [unreleasedModal, setUnreleasedModal] = useState<{
		title: string;
	} | null>(null);
	const [resumeModal, setResumeModal] = useState<{
		item: TMDBShow;
		highestEp: { season: number; episode: number };
		nextEp: { season: number; episode: number };
		nextEpName: string | null;
		nextEpAirDate: string | null;
	} | null>(null);
	const { addShowToUpcoming, removeShowFromUpcoming } = useUpcomingMutations();

	const withLoadingId = useCallback(async (id: number, fn: () => Promise<void>) => {
		setAddingIds((prev) => new Set(prev).add(id));
		try {
			await fn();
		} catch (err: any) {
			Alert.alert("Error", err.message || "Failed to complete action.");
		} finally {
			setAddingIds((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
		}
	}, []);

	const handleAddToWatchlist = useCallback(
		async (item: TMDBShow) => {
			if (!user?.uid) return;
			const mediaType: MediaType =
				item.media_type ||
				(item.first_air_date || (item.name && !item.title) ? MediaType.TV : MediaType.MOVIE);

			if (mediaType === MediaType.MOVIE) {
				const releaseDate = item.release_date || null;
				const today = todayStr();
				const isUnreleased = releaseDate && releaseDate > today;

				if (isUnreleased) {
					const addPromise = withLoadingId(item.id, () =>
						addToTracking(user.uid!, item.id, MediaType.MOVIE, releaseDate, {
							title: item.title || item.name || "",
							posterPath: item.poster_path || null,
						}),
					);
					shouldShowUnreleasedModal(user.uid!).then((shouldShow) => {
						if (shouldShow) {
							setUnreleasedModal({ title: item.title || item.name || "" });
						}
					});
					await addPromise;
					const movieEp: UpcomingEpisode = {
						tmdbShowId: item.id,
						showTitle: item.title || item.name || "",
						posterPath: item.poster_path || null,
						season: 0,
						episode: 0,
						episodeTitle: item.title || item.name || "",
						airDate: releaseDate!,
						runtime: null,
						mediaType: MediaType.MOVIE,
					};
					addShowToUpcoming(item.id, movieEp);
					addMovieToCalendarGlobal(movieEp);
					emitShowAdded(
						buildOptimisticItem(
							item.id,
							MediaType.MOVIE,
							item.title || item.name || "",
							item.poster_path || null,
							null,
							null,
							null,
							null,
							releaseDate,
						),
					);
					return;
				}

				setMovieModal(item);
				return;
			}

			await withLoadingId(item.id, async () => {
				const highestEp = await getHighestWatchedEpisode(user.uid!, item.id);
				if (highestEp) {
					setResumeModal({
						item,
						highestEp,
						nextEp: { season: highestEp.season, episode: highestEp.episode + 1 },
						nextEpName: null,
						nextEpAirDate: null,
					});
					return;
				}

				const title = item.title || item.name || "";
				const poster = item.poster_path || null;
				const epInfo = await fetchFirstEpisodeInfo(item.id, apiKey, item);

				await addToTracking(user.uid!, item.id, mediaType, undefined, {
					title,
					posterPath: poster,
					nextEpisodeName: epInfo.name,
					nextEpisodeAirDate: epInfo.airDate,
				});

				emitShowAdded(
					buildOptimisticItem(
						item.id,
						MediaType.TV,
						title,
						poster,
						{ season: 1, episode: 1 },
						epInfo.name,
						epInfo.airDate,
						epInfo.catalog,
					),
				);

				const todayLocal = todayStr();
				const upcomingEps: UpcomingEpisode[] = [];

				if (epInfo.catalog?.seasons?.length) {
					for (const s of epInfo.catalog.seasons) {
						if (s.seasonNumber === 0) continue;
						for (const ep of s.episodes) {
							if (ep.airDate && ep.airDate >= todayLocal) {
								upcomingEps.push({
									tmdbShowId: item.id,
									showTitle: title,
									posterPath: poster,
									season: s.seasonNumber,
									episode: ep.episodeNumber,
									episodeTitle: ep.title || "",
									airDate: ep.airDate,
									runtime: ep.runtime ?? null,
									mediaType: MediaType.TV,
								});
							}
						}
					}
				} else if (epInfo.tmdbEpisodes.length > 0) {
					for (const ep of epInfo.tmdbEpisodes) {
						if (ep.airDate && ep.airDate >= todayLocal) {
							upcomingEps.push({
								tmdbShowId: item.id,
								showTitle: title,
								posterPath: poster,
								season: ep.season,
								episode: ep.episode,
								episodeTitle: ep.name || title,
								airDate: ep.airDate,
								runtime: ep.runtime ?? null,
								mediaType: MediaType.TV,
							});
						}
					}
				}

				if (upcomingEps.length > 0) {
					addShowToUpcoming(item.id, upcomingEps);
					for (const ep of upcomingEps) {
						addMovieToCalendarGlobal(ep);
					}
				}
			});
		},
		[user?.uid, apiKey, withLoadingId, addShowToUpcoming],
	);

	const handleRemoveFromWatchlist = useCallback(
		(item: TMDBShow) => {
			if (!user?.uid) return;
			setRemoveError(null);
			setRemoveModal(item);
		},
		[user?.uid],
	);

	const handleConfirmRemove = useCallback(async () => {
		if (!user?.uid || !removeModal || removing) return;
		setRemoving(true);
		setRemoveError(null);
		try {
			const removeMediaType: MediaType =
				removeModal.media_type ||
				(removeModal.first_air_date || (removeModal.name && !removeModal.title)
					? MediaType.TV
					: MediaType.MOVIE);
			await removeFromTracking(user.uid, removeModal.id, removeMediaType);
			removeShowFromUpcoming(removeModal.id);
			removeShowFromCalendarGlobal(removeModal.id);
			emitShowRemoved(removeModal.id);
			setRemoveModal(null);
		} catch (err: any) {
			setRemoveError(err.message || "Failed to remove. Please try again.");
		} finally {
			setRemoving(false);
		}
	}, [user?.uid, removeModal, removing]);

	const handleMovieAddOnly = useCallback(async () => {
		if (!user?.uid || !movieModal) return;
		const item = movieModal;
		setMovieModal(null);
		await withLoadingId(item.id, async () => {
			const title = item.title || item.name || "";
			const poster = item.poster_path || null;
			await addToTracking(user.uid!, item.id, MediaType.MOVIE, undefined, {
				title,
				posterPath: poster,
			});
			emitShowAdded(
				buildOptimisticItem(
					item.id,
					MediaType.MOVIE,
					title,
					poster,
					null,
					null,
					null,
					null,
					item.release_date || null,
				),
			);
		});
	}, [user?.uid, movieModal, withLoadingId]);

	const handleMovieAddAndWatch = useCallback(async () => {
		if (!user?.uid || !movieModal) return;
		const item = movieModal;
		setMovieModal(null);
		await withLoadingId(item.id, async () => {
			const movieTitle = item.title || item.name || "";
			const moviePoster = item.poster_path || null;
			await addAndMarkMovieWatched(user.uid!, item.id, (item as any).runtime ?? 0, {
				title: movieTitle,
				posterPath: moviePoster,
			});
			const now = Timestamp.now();
			emitShowAdded({
				...buildOptimisticItem(
					item.id,
					MediaType.MOVIE,
					movieTitle,
					moviePoster,
					null,
					null,
					null,
					null,
					item.release_date || null,
				),
				status: WatchStatus.COMPLETED,
			});
			queryClient.setQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid!], (old: any) => {
				if (!old?.pages) return old;
				const newMovie = {
					id: `${item.id}_watched`,
					tmdbId: item.id,
					watchedAt: now,
					lastWatchedAt: now,
					runtime: (item as any).runtime ?? 0,
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
			incrementDailyWatch("movie");
			emitShowCompleted({
				tmdbId: item.id,
				mediaType: MediaType.MOVIE,
				title: movieTitle,
				posterPath: moviePoster,
				genres: [],
			});
		});
	}, [user?.uid, movieModal, withLoadingId, queryClient]);

	const handleResumeFromWhere = useCallback(async () => {
		if (!user?.uid || !resumeModal) return;
		const { item, nextEp, nextEpName, nextEpAirDate } = resumeModal;
		setResumeModal(null);
		await withLoadingId(item.id, async () => {
			const title = item.title || item.name || "";
			const poster = item.poster_path || null;
			await addToTracking(user.uid!, item.id, MediaType.TV, undefined, {
				title,
				posterPath: poster,
				nextEpisodeName: nextEpName,
				nextEpisodeAirDate: nextEpAirDate,
			});
			const db = getFirestore();
			await updateDoc(doc(db, "users", user.uid!, "tracking", showDocId(item.id, MediaType.TV)), {
				nextEpisode: nextEp,
				nextEpisodeName: nextEpName,
				nextEpisodeAirDate: nextEpAirDate,
			});
			const catalog = getCachedCatalogShow(item.id, MediaType.TV);
			emitShowAdded(
				buildOptimisticItem(
					item.id,
					MediaType.TV,
					title,
					poster,
					nextEp,
					nextEpName,
					nextEpAirDate,
					catalog,
				),
			);
			if (nextEpAirDate) {
				addShowToUpcoming(item.id, {
					tmdbShowId: item.id,
					showTitle: title,
					posterPath: poster,
					season: nextEp.season,
					episode: nextEp.episode,
					episodeTitle: nextEpName || "",
					airDate: nextEpAirDate,
					runtime: null,
				});
			}
		});
	}, [user?.uid, resumeModal, withLoadingId, addShowToUpcoming]);

	const handleStartFresh = useCallback(async () => {
		if (!user?.uid || !resumeModal) return;
		const item = resumeModal.item;
		setResumeModal(null);
		await withLoadingId(item.id, async () => {
			const title = item.title || item.name || "";
			const poster = item.poster_path || null;
			const epInfo = await fetchFirstEpisodeInfo(item.id, apiKey, item);
			await addToTracking(user.uid!, item.id, MediaType.TV, undefined, {
				title,
				posterPath: poster,
				nextEpisodeName: epInfo.name,
				nextEpisodeAirDate: epInfo.airDate,
			});
			emitShowAdded(
				buildOptimisticItem(
					item.id,
					MediaType.TV,
					title,
					poster,
					{ season: 1, episode: 1 },
					epInfo.name,
					epInfo.airDate,
					epInfo.catalog,
				),
			);
			const todayFresh = todayStr();
			const freshEps: UpcomingEpisode[] = [];
			if (epInfo.catalog?.seasons?.length) {
				for (const s of epInfo.catalog.seasons) {
					if (s.seasonNumber === 0) continue;
					for (const ep of s.episodes) {
						if (ep.airDate && ep.airDate >= todayFresh) {
							freshEps.push({
								tmdbShowId: item.id,
								showTitle: title,
								posterPath: poster,
								season: s.seasonNumber,
								episode: ep.episodeNumber,
								episodeTitle: ep.title || "",
								airDate: ep.airDate,
								runtime: ep.runtime ?? null,
								mediaType: MediaType.TV,
							});
						}
					}
				}
			} else if (epInfo.tmdbEpisodes.length > 0) {
				for (const ep of epInfo.tmdbEpisodes) {
					if (ep.airDate && ep.airDate >= todayFresh) {
						freshEps.push({
							tmdbShowId: item.id,
							showTitle: title,
							posterPath: poster,
							season: ep.season,
							episode: ep.episode,
							episodeTitle: ep.name || title,
							airDate: ep.airDate,
							runtime: ep.runtime ?? null,
							mediaType: MediaType.TV,
						});
					}
				}
			}
			if (freshEps.length > 0) {
				addShowToUpcoming(item.id, freshEps);
				for (const ep of freshEps) addMovieToCalendarGlobal(ep);
			}
		});
	}, [user?.uid, apiKey, resumeModal, withLoadingId, addShowToUpcoming]);

	return {
		user,
		trackedIds,
		addingIds,
		movieModal,
		setMovieModal,
		removeModal,
		setRemoveModal,
		removing,
		removeError,
		setRemoveError,
		unreleasedModal,
		setUnreleasedModal,
		resumeModal,
		setResumeModal,
		handleAddToWatchlist,
		handleRemoveFromWatchlist,
		handleConfirmRemove,
		handleMovieAddOnly,
		handleMovieAddAndWatch,
		handleResumeFromWhere,
		handleStartFresh,
	};
}
