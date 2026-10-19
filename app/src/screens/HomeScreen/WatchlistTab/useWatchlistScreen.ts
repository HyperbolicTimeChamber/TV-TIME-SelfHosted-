import { useCallback, useRef, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useAuthStore, useUiStore } from "../../../stores";
import {
	markEpisodeWatched,
	unmarkEpisodeWatched,
	decrementEpisodeWatchCount,
	markMovieWatched,
	unmarkMovieWatched,
	decrementMovieWatchCount,
	getCatalogShow,
	getSeasonDetails,
	getShowDetails,
} from "../../../services";
import {
	WatchedEpisode,
	WatchedMovie,
	MediaType,
	QueryKey,
	WatchStatus,
	WatchAction,
	CarouselEpisode,
	ShowDrawerData,
} from "../../../types";
import { warmupFirestoreWrite } from "../../../services/warmup";
import {
	Timestamp,
	getFirestore,
	collection,
	doc,
	query,
	where,
	getDocs,
} from "@react-native-firebase/firestore";
import {
	insertWatchedEpisodeCache,
	removeWatchedEpisodeCache,
	insertWatchedMovieCache,
	incrementDailyWatch,
	decrementDailyWatch,
} from "../../../hooks";
import { useWatchlistData } from "./useWatchlistData";
import { todayStr } from "../../../utils";

/**
 * Watchlist tab state + actions (episode modal, show drawer, previously-watched
 * sheets/swipes). Shared by the mobile WatchlistTab and the web watchlist.
 * Navigation is passed in so the hook stays platform-neutral.
 */
export function useWatchlistScreen(
	handleNavigateToShow: (tmdbId: number, mediaType: MediaType) => void,
) {
	const user = useAuthStore((s) => s.user);
	const queryClient = useQueryClient();
	useEffect(() => {
		if (user?.uid) warmupFirestoreWrite(user.uid);
	}, [user?.uid]);

	const {
		listData,
		loading,
		listSettled,
		loadMoreTracking,
		loadingMoreTracking,
		loadMorePrevWatched,
		loadingMorePrevWatched,
		hasMorePrevWatched,
		prevWatchedOffset,
		watchedCountByShow,
		updatingShows,
		handleMarkWatched,
		handleStopWatching,
		handleMarkWatchedThrough,
		handleUnmarkEpisode,
		handleCarouselMarkWatched,
		handleSkipEpisode,
	} = useWatchlistData(user?.uid);

	const isLoading = loading;
	const setWatchlistLoading = useUiStore((s) => s.setWatchlistLoading);

	// Action sheet state for previously watched episodes
	const [sheetVisible, setSheetVisible] = useState(false);
	const [sheetEpisode, setSheetEpisode] = useState<WatchedEpisode | null>(null);

	// Action sheet state for previously watched movies
	const [movieSheetVisible, setMovieSheetVisible] = useState(false);
	const [sheetMovie, setSheetMovie] = useState<WatchedMovie | null>(null);
	const [sheetMovieTitle, setSheetMovieTitle] = useState("");

	// Episode detail modal state
	const [epModalVisible, setEpModalVisible] = useState(false);
	const [epModalData, setEpModalData] = useState<{
		tmdbId: number;
		showTitle: string;
		showPosterPath: string | null;
		showBackdropPath: string | null;
		episodes: CarouselEpisode[];
		initialIndex: number;
		watchedKeys: Map<string, number>;
		currentNextEpisode: { season: number; episode: number } | null;
		/** Skipping is only offered during a rewatch */
		isRewatching: boolean;
		/** Rewatch run number while rewatching, else 0 */
		rewatchCount: number;
	} | null>(null);
	const epModalTmdbIdRef = useRef<number | null>(null);
	// Show drawer state
	const [drawerVisible, setDrawerVisible] = useState(false);
	const [drawerShow, setDrawerShow] = useState<ShowDrawerData | null>(null);

	useEffect(() => {
		setWatchlistLoading(isLoading);
	}, [isLoading, setWatchlistLoading]);

	const handleCardPress = useCallback(
		async (tmdbId: number, _mediaType: MediaType) => {
			const listItem = listData.find((li) => li.type === "show" && li.item.tmdbId === tmdbId);
			if (!listItem || listItem.type !== "show") return;
			const item = listItem.item;
			const ep = item.nextEpisode;
			if (!ep) return;

			const catalog = item.catalogShow;
			const today = todayStr();

			// Build flat episode list from catalog — all released episodes
			const allEps: CarouselEpisode[] = [];
			if (catalog?.seasons) {
				for (const s of catalog.seasons) {
					if (s.seasonNumber === 0) continue;
					for (const e of s.episodes) {
						if (!e.airDate || e.airDate <= today) {
							allEps.push({
								season: s.seasonNumber,
								episode: e.episodeNumber,
								title: e.title || null,
								airDate: e.airDate || null,
								runtime: e.runtime || null,
								stillPath: e.stillPath || null,
								overview: e.overview || null,
							});
						}
					}
				}
			}

			if (allEps.length === 0) return;

			const rawIdx = Math.max(
				0,
				allEps.findIndex((e) => e.season === ep.season && e.episode === ep.episode),
			);

			// Window to max 50 episodes around current
			const MAX_WINDOW = 50;
			let carouselEps = allEps;
			let initialIdx = rawIdx;
			if (allEps.length > MAX_WINDOW) {
				const half = Math.floor(MAX_WINDOW / 2);
				const start = Math.max(0, rawIdx - half);
				const end = Math.min(allEps.length, start + MAX_WINDOW);
				carouselEps = allEps.slice(start, end);
				initialIdx = rawIdx - start;
			}

			// Watched keys: this show's query cache, else fetch all its watched episodes (complete counts)
			let showWatched = queryClient.getQueryData<WatchedEpisode[]>([
				QueryKey.WATCHED_EPISODES,
				user?.uid,
				tmdbId,
			]);
			if (!showWatched) {
				const db = getFirestore();
				const colRef = collection(doc(db, "users", user!.uid), "watchedEpisodes");
				const q = query(colRef, where("tmdbShowId", "==", tmdbId));
				const snap = await getDocs(q);
				showWatched = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as WatchedEpisode[];
				queryClient.setQueryData([QueryKey.WATCHED_EPISODES, user!.uid, tmdbId], showWatched);
			}
			const wKeys = new Map<string, number>();
			for (const we of showWatched) {
				wKeys.set(
					`S${String(we.season).padStart(2, "0")}E${String(we.episode).padStart(2, "0")}`,
					we.watchCount ?? 1,
				);
			}

			epModalTmdbIdRef.current = tmdbId;
			setEpModalData({
				tmdbId,
				showTitle: item.title,
				showPosterPath: item.posterPath ?? null,
				showBackdropPath: catalog?.backdropPath ?? null,
				episodes: carouselEps,
				initialIndex: initialIdx,
				watchedKeys: wKeys,
				currentNextEpisode: ep,
				isRewatching: item.status === WatchStatus.REWATCHING,
				rewatchCount: item.status === WatchStatus.REWATCHING ? (item.rewatchCount ?? 0) : 0,
			});
			setEpModalVisible(true);
		},
		[listData, user?.uid, queryClient],
	);

	// Skip in modal → move the modal's "current" episode along with the watchlist pointer
	const handleModalSkip = useCallback(
		async (tmdbId: number, season: number, episode: number) => {
			const next = await handleSkipEpisode(tmdbId, season, episode);
			if (next === undefined) return;
			if (!next) {
				setEpModalVisible(false);
				setEpModalData(null);
				return;
			}
			setEpModalData((prev) => (prev ? { ...prev, currentNextEpisode: next } : prev));
		},
		[handleSkipEpisode],
	);

	const handleLoadEpisodeDetails = useCallback(
		async (season: number): Promise<CarouselEpisode[] | null> => {
			const tmdbId = epModalTmdbIdRef.current;
			const apiKey = useAuthStore.getState().appTmdbApiKey;
			if (!apiKey || !tmdbId) return null;
			try {
				const seasonData = await getSeasonDetails(apiKey, tmdbId, season);
				return seasonData.episodes.map((e) => ({
					season: e.season_number ?? season,
					episode: e.episode_number,
					title: e.name || null,
					airDate: e.air_date || null,
					runtime: e.runtime || null,
					stillPath: e.still_path || null,
					overview: e.overview || null,
				}));
			} catch {
				// Firestore fallback
				const catalog = await getCatalogShow(tmdbId, MediaType.TV);
				const catSeason = catalog?.seasons?.find((s) => s.seasonNumber === season);
				if (catSeason) {
					return catSeason.episodes.map((e) => ({
						season: catSeason.seasonNumber,
						episode: e.episodeNumber,
						title: e.title || null,
						airDate: e.airDate || null,
						runtime: e.runtime || null,
						stillPath: e.stillPath || null,
						overview: e.overview || null,
					}));
				}
				return null;
			}
		},
		[],
	);

	const handleEpModalShowPress = useCallback(() => {
		if (!epModalData) return;
		setEpModalVisible(false);
		setEpModalData(null);
		handleNavigateToShow(epModalData.tmdbId, MediaType.TV);
	}, [epModalData, handleNavigateToShow]);

	const handleTitlePress = useCallback(async (item: any) => {
		const cat = item.catalogShow;
		if (!cat) return;
		const catalogGenres = cat.genres?.length ? cat.genres.join(", ") : null;
		setDrawerShow({
			tmdbId: cat.tmdbId,
			title: cat.title,
			posterPath: cat.posterPath,
			backdropPath: cat.backdropPath,
			overview: cat.overview,
			mediaType: cat.mediaType,
			year: (cat.firstAirDate || cat.releaseDate || "")?.substring(0, 4) || null,
			totalSeasons: cat.totalSeasons,
			totalEpisodes: cat.totalEpisodes,
			runtime: cat.runtime,
			voteAverage: cat.voteAverage,
			genres: catalogGenres,
		});
		setDrawerVisible(true);

		// Fetch genres from TMDB
		const apiKey = useAuthStore.getState().appTmdbApiKey;
		if (apiKey) {
			try {
				const data = (await getShowDetails(apiKey, cat.tmdbId, cat.mediaType)) as any;
				const genres = data?.genres?.map((g: any) => g.name).join(", ");
				if (genres) {
					setDrawerShow((prev) => (prev ? { ...prev, genres } : null));
				}
			} catch {}
		}
	}, []);

	const handleWatchedCheckmark = useCallback((episode: WatchedEpisode) => {
		setSheetEpisode(episode);
		setSheetVisible(true);
	}, []);

	const handleWatchedSwipeLeft = useCallback(
		async (episode: WatchedEpisode) => {
			if (!user?.uid) return;
			const catalog = await getCatalogShow(episode.tmdbShowId, MediaType.TV);
			const catalogSeason = catalog?.seasons?.find((s) => s.seasonNumber === episode.season);
			const catalogEp = catalogSeason?.episodes?.find((e) => e.episodeNumber === episode.episode);
			const nextEpInSeason = catalogSeason?.episodes?.find(
				(e) => e.episodeNumber === episode.episode + 1,
			);

			let nextEpisode: { season: number; episode: number } | null = null;
			let isComplete = false;

			if (nextEpInSeason) {
				nextEpisode = {
					season: episode.season,
					episode: nextEpInSeason.episodeNumber,
				};
			} else {
				const nextCatalogSeason = catalog?.seasons?.find(
					(s) => s.seasonNumber === episode.season + 1,
				);
				if (nextCatalogSeason && nextCatalogSeason.episodes.length > 0) {
					nextEpisode = { season: episode.season + 1, episode: 1 };
				} else {
					isComplete = true;
				}
			}

			await markEpisodeWatched(
				user.uid,
				episode.tmdbShowId,
				episode.season,
				episode.episode,
				catalogEp?.title || episode.episodeTitle,
				catalogEp?.runtime || episode.runtime,
				nextEpisode,
				isComplete,
			);
			const now = Timestamp.now();
			insertWatchedEpisodeCache(queryClient, user.uid, {
				id: `${episode.tmdbShowId}_S${String(episode.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`,
				tmdbShowId: episode.tmdbShowId,
				season: episode.season,
				episode: episode.episode,
				episodeTitle: catalogEp?.title || episode.episodeTitle,
				runtime: catalogEp?.runtime || episode.runtime,
				lastWatchedAt: now,
				watchedAt: now,
				watchCount: (episode.watchCount || 0) + 1,
			});
			incrementDailyWatch("episode");
		},
		[user?.uid, queryClient],
	);

	const handleWatchedSwipeRight = useCallback(
		async (episode: WatchedEpisode) => {
			if (!user?.uid) return;
			if (episode.watchCount > 1) {
				await decrementEpisodeWatchCount(
					user.uid,
					episode.tmdbShowId,
					episode.season,
					episode.episode,
					episode.runtime,
					episode.watchCount,
					episode.episodeTitle,
				);
			} else {
				await unmarkEpisodeWatched(
					user.uid,
					episode.tmdbShowId,
					episode.season,
					episode.episode,
					episode.runtime,
					episode.episodeTitle,
				);
			}
			removeWatchedEpisodeCache(
				queryClient,
				user.uid,
				episode.tmdbShowId,
				episode.season,
				episode.episode,
				episode.watchCount > 1,
			);
			decrementDailyWatch("episode");
		},
		[user?.uid, queryClient],
	);

	const handleSheetAction = useCallback(
		async (action: WatchAction) => {
			if (!user?.uid || !sheetEpisode) return;

			try {
				if (action === "rewatch") {
					const catalog = await getCatalogShow(sheetEpisode.tmdbShowId, MediaType.TV);
					const catalogSeason = catalog?.seasons?.find(
						(s) => s.seasonNumber === sheetEpisode.season,
					);
					const catalogEp = catalogSeason?.episodes?.find(
						(e) => e.episodeNumber === sheetEpisode.episode,
					);
					const nextEpInSeason = catalogSeason?.episodes?.find(
						(e) => e.episodeNumber === sheetEpisode.episode + 1,
					);

					let nextEpisode: { season: number; episode: number } | null = null;
					let isComplete = false;

					if (nextEpInSeason) {
						nextEpisode = {
							season: sheetEpisode.season,
							episode: nextEpInSeason.episodeNumber,
						};
					} else {
						const nextCatalogSeason = catalog?.seasons?.find(
							(s) => s.seasonNumber === sheetEpisode.season + 1,
						);
						if (nextCatalogSeason && nextCatalogSeason.episodes.length > 0) {
							nextEpisode = { season: sheetEpisode.season + 1, episode: 1 };
						} else {
							isComplete = true;
						}
					}

					await markEpisodeWatched(
						user.uid,
						sheetEpisode.tmdbShowId,
						sheetEpisode.season,
						sheetEpisode.episode,
						catalogEp?.title || sheetEpisode.episodeTitle,
						catalogEp?.runtime || sheetEpisode.runtime,
						nextEpisode,
						isComplete,
					);
					incrementDailyWatch("episode");
				} else if (action === "not_watched") {
					await unmarkEpisodeWatched(
						user.uid,
						sheetEpisode.tmdbShowId,
						sheetEpisode.season,
						sheetEpisode.episode,
						sheetEpisode.runtime,
						sheetEpisode.episodeTitle,
					);
					decrementDailyWatch("episode");
				} else if (action === "watched_once_less") {
					await decrementEpisodeWatchCount(
						user.uid,
						sheetEpisode.tmdbShowId,
						sheetEpisode.season,
						sheetEpisode.episode,
						sheetEpisode.runtime,
						sheetEpisode.watchCount,
						sheetEpisode.episodeTitle,
					);
					decrementDailyWatch("episode");
				}
				if (action === "rewatch") {
					const now = Timestamp.now();
					insertWatchedEpisodeCache(queryClient, user.uid, {
						id: `${sheetEpisode.tmdbShowId}_S${String(sheetEpisode.season).padStart(2, "0")}E${String(sheetEpisode.episode).padStart(2, "0")}`,
						tmdbShowId: sheetEpisode.tmdbShowId,
						season: sheetEpisode.season,
						episode: sheetEpisode.episode,
						episodeTitle: sheetEpisode.episodeTitle,
						runtime: sheetEpisode.runtime,
						lastWatchedAt: now,
						watchedAt: now,
						watchCount: (sheetEpisode.watchCount || 0) + 1,
					});
				} else {
					removeWatchedEpisodeCache(
						queryClient,
						user.uid,
						sheetEpisode.tmdbShowId,
						sheetEpisode.season,
						sheetEpisode.episode,
						action === "watched_once_less",
					);
				}
			} catch (err: any) {
				console.error("Watch action failed:", err);
				Alert.alert("Error", err.message || "Action failed.");
			}

			setSheetEpisode(null);
		},
		[user?.uid, sheetEpisode, queryClient],
	);

	// --- Watched movie handlers ---
	const handleMovieCheckmark = useCallback((movie: WatchedMovie, title: string) => {
		setSheetMovie(movie);
		setSheetMovieTitle(title);
		setMovieSheetVisible(true);
	}, []);

	const handleMovieSwipeLeft = useCallback(
		async (movie: WatchedMovie) => {
			if (!user?.uid) return;
			await markMovieWatched(user.uid, movie.tmdbId, movie.runtime ?? 0);
			insertWatchedMovieCache(queryClient, user.uid, {
				...movie,
				watchCount: (movie.watchCount || 0) + 1,
				lastWatchedAt: Timestamp.now(),
			});
			incrementDailyWatch("movie");
		},
		[user?.uid, queryClient],
	);

	const handleMovieSwipeRight = useCallback(
		async (movie: WatchedMovie) => {
			if (!user?.uid) return;
			if (movie.watchCount > 1) {
				await decrementMovieWatchCount(
					user.uid,
					movie.tmdbId,
					movie.runtime ?? 0,
					movie.watchCount,
				);
				queryClient.setQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid], (old: any) => {
					if (!old?.pages) return old;
					return {
						...old,
						pages: old.pages.map((p: any) => ({
							...p,
							movies: p.movies.map((m: any) =>
								m.tmdbId === movie.tmdbId ? { ...m, watchCount: (m.watchCount || 1) - 1 } : m,
							),
						})),
					};
				});
			} else {
				await unmarkMovieWatched(user.uid, movie.tmdbId, movie.runtime ?? 0);
				queryClient.setQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid], (old: any) => {
					if (!old?.pages) return old;
					return {
						...old,
						pages: old.pages.map((p: any) => ({
							...p,
							movies: p.movies.filter((m: any) => m.tmdbId !== movie.tmdbId),
						})),
					};
				});
			}
			decrementDailyWatch("movie");
		},
		[user?.uid, queryClient],
	);

	const handleMovieSheetAction = useCallback(
		async (action: WatchAction) => {
			if (!user?.uid || !sheetMovie) return;
			try {
				if (action === "rewatch") {
					await markMovieWatched(user.uid, sheetMovie.tmdbId, sheetMovie.runtime ?? 0);
					insertWatchedMovieCache(queryClient, user.uid, {
						...sheetMovie,
						watchCount: (sheetMovie.watchCount || 0) + 1,
						lastWatchedAt: Timestamp.now(),
					});
					incrementDailyWatch("movie");
				} else if (action === "watched_once_less") {
					if (sheetMovie.watchCount <= 1) {
						await unmarkMovieWatched(user.uid, sheetMovie.tmdbId, sheetMovie.runtime ?? 0);
						queryClient.setQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid], (old: any) => {
							if (!old?.pages) return old;
							return {
								...old,
								pages: old.pages.map((p: any) => ({
									...p,
									movies: p.movies.filter((m: any) => m.tmdbId !== sheetMovie.tmdbId),
								})),
							};
						});
					} else {
						await decrementMovieWatchCount(
							user.uid,
							sheetMovie.tmdbId,
							sheetMovie.runtime ?? 0,
							sheetMovie.watchCount,
						);
						queryClient.setQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid], (old: any) => {
							if (!old?.pages) return old;
							return {
								...old,
								pages: old.pages.map((p: any) => ({
									...p,
									movies: p.movies.map((m: any) =>
										m.tmdbId === sheetMovie.tmdbId
											? { ...m, watchCount: (m.watchCount || 1) - 1 }
											: m,
									),
								})),
							};
						});
					}
					decrementDailyWatch("movie");
				} else if (action === "not_watched") {
					await unmarkMovieWatched(user.uid, sheetMovie.tmdbId, sheetMovie.runtime ?? 0);
					queryClient.setQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid], (old: any) => {
						if (!old?.pages) return old;
						return {
							...old,
							pages: old.pages.map((p: any) => ({
								...p,
								movies: p.movies.filter((m: any) => m.tmdbId !== sheetMovie.tmdbId),
							})),
						};
					});
					decrementDailyWatch("movie");
				}
			} catch (err: any) {
				console.error("Movie action failed:", err);
				Alert.alert("Error", err.message || "Action failed.");
			}
			setSheetMovie(null);
		},
		[user?.uid, sheetMovie, queryClient],
	);

	const handleTvPress = useCallback(
		(id: number) => handleNavigateToShow(id, MediaType.TV),
		[handleNavigateToShow],
	);

	const sheetLabel = sheetEpisode
		? `S${String(sheetEpisode.season).padStart(2, "0")}E${String(sheetEpisode.episode).padStart(2, "0")} - ${sheetEpisode.episodeTitle}`
		: "";

	return {
		user,
		queryClient,
		isLoading,
		setWatchlistLoading,
		sheetVisible,
		setSheetVisible,
		sheetEpisode,
		setSheetEpisode,
		movieSheetVisible,
		setMovieSheetVisible,
		sheetMovie,
		setSheetMovie,
		sheetMovieTitle,
		setSheetMovieTitle,
		epModalVisible,
		setEpModalVisible,
		epModalData,
		setEpModalData,
		epModalTmdbIdRef,
		drawerVisible,
		setDrawerVisible,
		drawerShow,
		setDrawerShow,
		handleCardPress,
		handleModalSkip,
		handleLoadEpisodeDetails,
		handleEpModalShowPress,
		handleTitlePress,
		handleWatchedCheckmark,
		handleWatchedSwipeLeft,
		handleWatchedSwipeRight,
		handleSheetAction,
		handleMovieCheckmark,
		handleMovieSwipeLeft,
		handleMovieSwipeRight,
		handleMovieSheetAction,
		handleTvPress,
		sheetLabel,
		listData,
		loading,
		listSettled,
		loadMoreTracking,
		loadingMoreTracking,
		loadMorePrevWatched,
		loadingMorePrevWatched,
		hasMorePrevWatched,
		prevWatchedOffset,
		watchedCountByShow,
		updatingShows,
		handleMarkWatched,
		handleStopWatching,
		handleMarkWatchedThrough,
		handleUnmarkEpisode,
		handleCarouselMarkWatched,
		handleSkipEpisode,
	};
}
