import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getFirestore, doc, updateDoc, Timestamp } from "@react-native-firebase/firestore";
import { shouldShowUnreleasedModal } from "../../services/unreleasedModalPref";
import {
	useTrackedIds,
	useUpcomingMutations,
	removeShowFromCalendarGlobal,
	addMovieToCalendarGlobal,
	incrementDailyWatch,
	insertWatchedMovieCache,
	prefillCatalog,
} from "../../hooks";
import { useAuthStore } from "../../stores";
import {
	addToTracking,
	removeFromTracking,
	addAndMarkMovieWatched,
	getHighestWatchedEpisode,
	getWatchProgress,
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
	WatchStatus,
	WatchedMovie,
	UpcomingEpisode,
	type AddFailure,
} from "../../types";
import { WatchProgress } from "../../enums";
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
	// Remove refused: started / watched (history must be cleared on the show page first)
	const [watchedBlock, setWatchedBlock] = useState<{
		item: TMDBShow;
		progress: WatchProgress;
	} | null>(null);
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

	const [addFailure, setAddFailure] = useState<AddFailure | null>(null);
	// The item the open failure popup would retry
	const retryItem = useRef<TMDBShow | null>(null);

	const withLoadingId = useCallback(
		async (
			id: number,
			fn: () => Promise<void>,
			/** Add actions report through the in-app popup instead of a native Alert, which
			 *  would only surface the next time the app is opened */
			failure?: Omit<AddFailure, "message">,
		) => {
			setAddingIds((prev) => new Set(prev).add(id));
			try {
				await fn();
			} catch (err: any) {
				const message = err.message || "Failed to complete action.";
				if (failure) setAddFailure({ ...failure, message });
				else Alert.alert("Error", message);
			} finally {
				setAddingIds((prev) => {
					const next = new Set(prev);
					next.delete(id);
					return next;
				});
			}
		},
		[],
	);

	/** Full catalog once the background fill has it (else null — the fill patches the card later) */
	const filledCatalog = (tmdbId: number, mediaType: MediaType) => {
		const c = getCachedCatalogShow(tmdbId, mediaType);
		return c && !c.partial && c.title ? c : null;
	};

	/** What the "couldn't add" popup needs to draw this title's banner */
	const failureFor = useCallback(
		(item: TMDBShow, mediaType: MediaType): Omit<AddFailure, "message"> => ({
			title: item.title || item.name || "",
			tmdbId: item.id,
			mediaType,
			backdropPath: item.backdrop_path ?? null,
			logoPath: getCachedCatalogShow(item.id, mediaType)?.logoPath ?? null,
		}),
		[],
	);

	const handleAddToWatchlist = useCallback(
		async (item: TMDBShow) => {
			if (!user?.uid) return;
			const mediaType: MediaType =
				item.media_type ||
				(item.first_air_date || (item.name && !item.title) ? MediaType.TV : MediaType.MOVIE);
			retryItem.current = item;
			setAddFailure(null);
			const addFailed = failureFor(item, mediaType);

			if (mediaType === MediaType.MOVIE) {
				const releaseDate = item.release_date || null;
				const today = todayStr();
				const isUnreleased = releaseDate && releaseDate > today;

				if (isUnreleased) {
					prefillCatalog(item.id, MediaType.MOVIE);
					const addPromise = withLoadingId(
						item.id,
						() =>
							addToTracking(user.uid!, item.id, MediaType.MOVIE, releaseDate, {
								title: item.title || item.name || "",
								posterPath: item.poster_path || null,
							}),
						addFailed,
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
							filledCatalog(item.id, MediaType.MOVIE),
							releaseDate,
						),
					);
					return;
				}

				setMovieModal(item);
				return;
			}

			await withLoadingId(
				item.id,
				async () => {
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
					// Full catalog from the add's addShow response — the watchlist heal has nothing left
					prefillCatalog(item.id, MediaType.TV);

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
				},
				addFailed,
			);
		},
		[user?.uid, apiKey, withLoadingId, addShowToUpcoming, failureFor],
	);

	/** Retry the add the failure popup is about */
	const retryAdd = useCallback(() => {
		const item = retryItem.current;
		setAddFailure(null);
		if (item) handleAddToWatchlist(item);
	}, [handleAddToWatchlist]);
	const dismissAddFailure = useCallback(() => setAddFailure(null), []);

	const handleRemoveFromWatchlist = useCallback(
		async (item: TMDBShow) => {
			if (!user?.uid) return;
			const mediaType: MediaType =
				item.media_type ||
				(item.first_air_date || (item.name && !item.title) ? MediaType.TV : MediaType.MOVIE);
			// Can't tell (offline, no cached doc) → the normal confirm; history is kept either way
			const progress = await getWatchProgress(user.uid, item.id, mediaType).catch(
				() => WatchProgress.NONE,
			);
			if (progress !== WatchProgress.NONE) {
				setWatchedBlock({ item, progress });
				return;
			}
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
		prefillCatalog(item.id, MediaType.MOVIE);
		retryItem.current = item;
		await withLoadingId(
			item.id,
			async () => {
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
						filledCatalog(item.id, MediaType.MOVIE),
						item.release_date || null,
					),
				);
			},
			failureFor(item, MediaType.MOVIE),
		);
	}, [user?.uid, movieModal, withLoadingId, failureFor]);

	const handleMovieAddAndWatch = useCallback(async () => {
		if (!user?.uid || !movieModal) return;
		const item = movieModal;
		setMovieModal(null);
		prefillCatalog(item.id, MediaType.MOVIE);
		retryItem.current = item;
		await withLoadingId(
			item.id,
			async () => {
				const movieTitle = item.title || item.name || "";
				const moviePoster = item.poster_path || null;
				// Search results carry no runtime — a cached catalog may (else the write reads the doc)
				const runtime: number =
					(item as any).runtime || getCachedCatalogShow(item.id, MediaType.MOVIE)?.runtime || 0;
				await addAndMarkMovieWatched(user.uid!, item.id, runtime, {
					title: movieTitle,
					posterPath: moviePoster,
				});
				const now = Timestamp.now();
				const catalog = filledCatalog(item.id, MediaType.MOVIE);
				emitShowAdded({
					...buildOptimisticItem(
						item.id,
						MediaType.MOVIE,
						movieTitle,
						moviePoster,
						null,
						null,
						null,
						catalog,
						item.release_date || null,
					),
					status: WatchStatus.COMPLETED,
				});
				// Same row id as the watchedMovies doc (String(tmdbId)) — creates the first page if empty
				insertWatchedMovieCache(queryClient, user.uid!, {
					id: String(item.id),
					tmdbId: item.id,
					watchedAt: now,
					lastWatchedAt: now,
					runtime,
					watchCount: 1,
					title: movieTitle,
					posterPath: moviePoster,
					releaseDate: catalog?.releaseDate ?? item.release_date ?? null,
				} as WatchedMovie);
				incrementDailyWatch("movie");
				emitShowCompleted({
					tmdbId: item.id,
					mediaType: MediaType.MOVIE,
					title: movieTitle,
					posterPath: moviePoster,
					genres: catalog?.genres ?? [],
				});
			},
			failureFor(item, MediaType.MOVIE),
		);
	}, [user?.uid, movieModal, withLoadingId, queryClient, failureFor]);

	const handleResumeFromWhere = useCallback(async () => {
		if (!user?.uid || !resumeModal) return;
		const { item, nextEp, nextEpName, nextEpAirDate } = resumeModal;
		setResumeModal(null);
		prefillCatalog(item.id, MediaType.TV);
		retryItem.current = item;
		await withLoadingId(
			item.id,
			async () => {
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
			},
			failureFor(item, MediaType.TV),
		);
	}, [user?.uid, resumeModal, withLoadingId, addShowToUpcoming, failureFor]);

	const handleStartFresh = useCallback(async () => {
		if (!user?.uid || !resumeModal) return;
		const item = resumeModal.item;
		setResumeModal(null);
		prefillCatalog(item.id, MediaType.TV);
		retryItem.current = item;
		await withLoadingId(
			item.id,
			async () => {
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
			},
			failureFor(item, MediaType.TV),
		);
	}, [user?.uid, apiKey, resumeModal, withLoadingId, addShowToUpcoming, failureFor]);

	return {
		user,
		trackedIds,
		addingIds,
		movieModal,
		setMovieModal,
		removeModal,
		setRemoveModal,
		watchedBlock,
		setWatchedBlock,
		removing,
		removeError,
		setRemoveError,
		unreleasedModal,
		setUnreleasedModal,
		resumeModal,
		setResumeModal,
		handleAddToWatchlist,
		addFailure,
		retryAdd,
		dismissAddFailure,
		handleRemoveFromWatchlist,
		handleConfirmRemove,
		handleMovieAddOnly,
		handleMovieAddAndWatch,
		handleResumeFromWhere,
		handleStartFresh,
	};
}
