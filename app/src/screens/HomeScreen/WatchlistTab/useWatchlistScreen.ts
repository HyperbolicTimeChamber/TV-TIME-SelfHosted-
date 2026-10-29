import { useCallback, useRef, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useAuthStore, useUiStore } from "../../../stores";
import {
	markEpisodeWatched,
	markMovieWatched,
	writeMovieWatchCount,
	writeEpisodeWatchCount,
	getCatalogShow,
	getShowDetails,
} from "../../../services";
import {
	WatchedEpisode,
	WatchedMovie,
	MediaType,
	QueryKey,
	WatchStatus,
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
	getDocsFromCache,
} from "@react-native-firebase/firestore";
import {
	insertWatchedEpisodeCache,
	setWatchedEpisodeCountsCache,
	insertWatchedMovieCache,
	incrementDailyWatch,
	decrementDailyWatch,
	loadSeasonEpisodes,
	getCachedCatalogShow,
} from "../../../hooks";
import { useWatchlistData } from "./useWatchlistData";
import { todayStr, adjacentPointer } from "../../../utils";

/**
 * Watchlist tab state + actions (episode modal, show drawer, previously-watched
 * sheets/swipes). Shared by the mobile WatchlistTab and the web watchlist.
 * Navigation is passed in so the hook stays platform-neutral.
 */
/** Watched counts keyed SxxEyy, as the episode modal reads them */
/** Everything before the show's next episode counts as watched once — what the watchlist card
 *  itself shows, so the popup can open with it while the real counts are fetched */
function watchedKeysBefore(
	eps: CarouselEpisode[],
	next: { season: number; episode: number },
): Map<string, number> {
	const keys = new Map<string, number>();
	for (const e of eps) {
		if (e.season > next.season || (e.season === next.season && e.episode >= next.episode)) break;
		keys.set(`S${String(e.season).padStart(2, "0")}E${String(e.episode).padStart(2, "0")}`, 1);
	}
	return keys;
}

function watchedKeysOf(rows: WatchedEpisode[]): Map<string, number> {
	const keys = new Map<string, number>();
	for (const we of rows) {
		keys.set(
			`S${String(we.season).padStart(2, "0")}E${String(we.episode).padStart(2, "0")}`,
			we.watchCount ?? 1,
		);
	}
	return keys;
}

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
		showMap,
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

			// Watched keys: this show's query cache when it's there, else what the pointer already
			// tells us — every released episode before `nextEpisode` has been watched. Awaiting
			// Firestore here held the popup shut for the whole round trip; the real counts patch
			// in below the moment they land.
			const watchedKey = [QueryKey.WATCHED_EPISODES, user?.uid, tmdbId];
			const cachedWatched = queryClient.getQueryData<WatchedEpisode[]>(watchedKey);
			const wKeys = cachedWatched
				? watchedKeysOf(cachedWatched)
				: watchedKeysBefore(carouselEps, ep);

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

			// …and the real counts in the background, oldest source first
			if (cachedWatched) return;
			const uid = user?.uid;
			if (!uid) return;
			const db = getFirestore();
			const colRef = collection(doc(db, "users", uid), "watchedEpisodes");
			const q = query(colRef, where("tmdbShowId", "==", tmdbId));
			const rowsOf = (snap: { docs: { id: string; data: () => unknown }[] }) =>
				snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as WatchedEpisode[];
			const patch = (rows: WatchedEpisode[]) => {
				queryClient.setQueryData(watchedKey, rows);
				setEpModalData((prev) =>
					prev?.tmdbId === tmdbId ? { ...prev, watchedKeys: watchedKeysOf(rows) } : prev,
				);
			};
			// Device copy first (instant, not a billed read), then the server's
			const cached = await getDocsFromCache(q).catch(() => null);
			if (cached && !cached.empty) patch(rowsOf(cached));
			await getDocs(q)
				.then((snap) => patch(rowsOf(snap)))
				.catch(() => {});
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

	// Shared with Calendar: TMDB season via the query cache, no Firestore fallback read
	const handleLoadEpisodeDetails = useCallback(
		(season: number) => loadSeasonEpisodes(queryClient, epModalTmdbIdRef.current, season),
		[queryClient],
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

	/**
	 * Where a watch count change on a Previously Watched row moves the watchlist pointer, by the
	 * run rule (adjacentPointer): an episode, null (stays), or undefined when the show / its
	 * episode order isn't loaded, or it's completed → writeEpisodeWatchCount's legacy "back to
	 * this episode at a real 0". No reads: status, rewatch number, pointer and order are cached
	 */
	const watchlistPointer = useCallback(
		(episode: WatchedEpisode, from: number, to: number) => {
			const item = showMap.get(episode.tmdbShowId);
			if (!item) return undefined;
			const status = item.status;
			const run =
				status === WatchStatus.WATCHING || status === WatchStatus.PAUSED
					? 1
					: status === WatchStatus.REWATCHING || status === WatchStatus.PAUSED_REWATCH
						? (item.rewatchCount ?? 0) + 1
						: null;
			if (run === null) return undefined;
			const catalog = item.catalogShow ?? getCachedCatalogShow(episode.tmdbShowId, MediaType.TV);
			if (!catalog?.seasons?.length) return undefined;
			const seasons = catalog.seasons
				.filter((s) => s.seasonNumber > 0)
				.sort((x, y) => x.seasonNumber - y.seasonNumber);
			const order = seasons.flatMap((s) =>
				s.episodes.map((e) => ({ season: s.seasonNumber, episode: e.episodeNumber })),
			);
			const target = adjacentPointer(
				order,
				item.nextEpisode,
				{ season: episode.season, episode: episode.episode },
				from,
				to,
				run,
			);
			if (!target) return null;
			const info = seasons
				.find((s) => s.seasonNumber === target.season)
				?.episodes.find((e) => e.episodeNumber === target.episode);
			return { ...target, name: info?.title ?? null, airDate: info?.airDate ?? null };
		},
		[showMap],
	);

	const handleWatchedSwipeRight = useCallback(
		async (episode: WatchedEpisode) => {
			if (!user?.uid) return;
			const uid = user.uid;
			// Mid-rewatch: not below the rewatch number (as the sheet's −) — earlier runs stay
			const show = showMap.get(episode.tmdbShowId);
			const inRewatch =
				show?.status === WatchStatus.REWATCHING || show?.status === WatchStatus.PAUSED_REWATCH;
			const floor = inRewatch ? (show?.rewatchCount ?? 0) : 0;
			const count = episode.watchCount || 0;
			if (count <= floor) return;
			// Off the real count (read first): a stale cached count can't delete watches. Only a
			// real 0 points the watchlist back to this episode
			const final = await writeEpisodeWatchCount(
				uid,
				episode.tmdbShowId,
				{
					season: episode.season,
					episode: episode.episode,
					title: episode.episodeTitle,
					runtime: episode.runtime,
				},
				count,
				count - 1,
				undefined,
				watchlistPointer(episode, count, count - 1),
			);
			setWatchedEpisodeCountsCache(
				queryClient,
				uid,
				episode.tmdbShowId,
				new Map([[`${episode.season}_${episode.episode}`, final]]),
			);
			decrementDailyWatch("episode");
		},
		[user?.uid, queryClient, showMap, watchlistPointer],
	);

	/**
	 * Watch count sheet settled on a new count for the sheet's episode. Optimistic: both cached
	 * lists take the exact count first (up also moves the row to the top — watched now), then one
	 * batch write (writeEpisodeWatchCount); a failed write puts the row back as it was.
	 */
	const handleEpisodeCountCommit = useCallback(
		async (from: number, to: number): Promise<number | void> => {
			const ep = sheetEpisode;
			if (!user?.uid || !ep || from === to) return;
			const uid = user.uid;
			const key = `${ep.season}_${ep.episode}`;
			/** Row at `n` watches (0 = gone); a row that's gone comes back via insert */
			const showCount = (n: number, prevN: number, watchedAt: Timestamp) => {
				if (prevN <= 0 && n > 0) {
					insertWatchedEpisodeCache(queryClient, uid, {
						...ep,
						lastWatchedAt: watchedAt,
						watchCount: n,
					});
				} else {
					setWatchedEpisodeCountsCache(
						queryClient,
						uid,
						ep.tmdbShowId,
						new Map([[key, n]]),
						watchedAt,
					);
				}
			};
			showCount(to, from, to > from ? Timestamp.now() : ep.lastWatchedAt);
			let final: number;
			try {
				final = await writeEpisodeWatchCount(
					uid,
					ep.tmdbShowId,
					{ season: ep.season, episode: ep.episode, title: ep.episodeTitle, runtime: ep.runtime },
					from,
					to,
					undefined,
					watchlistPointer(ep, from, to),
				);
			} catch (err: any) {
				showCount(from, to, ep.lastWatchedAt);
				console.error("Watch count change failed:", err);
				Alert.alert("Error", err.message || "Couldn't update the watch count.");
				return;
			}
			// Firestore's real count differed (a stale cached count) → the row follows it
			if (final !== to) showCount(final, to, ep.lastWatchedAt);
			for (let i = 0; i < Math.abs(final - from); i++) {
				if (final > from) incrementDailyWatch("episode");
				else decrementDailyWatch("episode");
			}
			return final;
		},
		[user?.uid, sheetEpisode, queryClient, watchlistPointer],
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
			const count = movie.watchCount || 0;
			if (count <= 0) return;
			// Off the real count (read first): a stale cached count can't delete watches
			const final = await writeMovieWatchCount(
				user.uid,
				movie.tmdbId,
				movie.runtime ?? 0,
				count,
				count - 1,
			);
			queryClient.setQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid], (old: any) => {
				if (!old?.pages) return old;
				return {
					...old,
					pages: old.pages.map((p: any) => ({
						...p,
						movies: p.movies.flatMap((m: any) =>
							m.tmdbId !== movie.tmdbId ? [m] : final > 0 ? [{ ...m, watchCount: final }] : [],
						),
					})),
				};
			});
			decrementDailyWatch("movie");
		},
		[user?.uid, queryClient],
	);

	/** Movie row's watch count sheet settled: optimistic like the episode one, then one batch write */
	const handleMovieCountCommit = useCallback(
		async (from: number, to: number): Promise<number | void> => {
			const movie = sheetMovie;
			if (!user?.uid || !movie || from === to) return;
			const uid = user.uid;
			/** Row at `n` watches (0 = gone); a row that's gone comes back via insert */
			const showCount = (n: number, prevN: number, watchedAt: Timestamp) => {
				if (prevN <= 0 && n > 0) {
					insertWatchedMovieCache(queryClient, uid, {
						...movie,
						lastWatchedAt: watchedAt,
						watchCount: n,
					});
					return;
				}
				queryClient.setQueryData<any>([QueryKey.WATCHED_MOVIES, uid], (old: any) => {
					if (!old?.pages) return old;
					return {
						...old,
						pages: old.pages.map((p: any) => ({
							...p,
							movies: p.movies.flatMap((m: any) =>
								m.tmdbId !== movie.tmdbId
									? [m]
									: n > 0
										? [{ ...m, watchCount: n, lastWatchedAt: watchedAt }]
										: [],
							),
						})),
					};
				});
			};
			showCount(to, from, to > from ? Timestamp.now() : movie.lastWatchedAt);
			let final: number;
			try {
				final = await writeMovieWatchCount(uid, movie.tmdbId, movie.runtime ?? 0, from, to);
			} catch (err: any) {
				showCount(from, to, movie.lastWatchedAt);
				console.error("Watch count change failed:", err);
				Alert.alert("Error", err.message || "Couldn't update the watch count.");
				return;
			}
			// Firestore's real count differed (a stale cached count) → the row follows it
			if (final !== to) showCount(final, to, movie.lastWatchedAt);
			for (let i = 0; i < Math.abs(final - from); i++) {
				if (final > from) incrementDailyWatch("movie");
				else decrementDailyWatch("movie");
			}
			return final;
		},
		[user?.uid, sheetMovie, queryClient],
	);

	const handleTvPress = useCallback(
		(id: number) => handleNavigateToShow(id, MediaType.TV),
		[handleNavigateToShow],
	);

	// Sheet's show is rewatching (or has one paused) → no "Watched Once": it would wipe earlier
	// runs' watches. A show off the loaded watchlist pages counts as not rewatching
	const sheetStatus = sheetEpisode ? showMap.get(sheetEpisode.tmdbShowId)?.status : undefined;
	const sheetInRewatch =
		sheetStatus === WatchStatus.REWATCHING || sheetStatus === WatchStatus.PAUSED_REWATCH;
	// Mid-rewatch the sheet's − stops at the rewatch number (run x − 1): only this run's watch
	// (and extras) can come off — earlier runs' watches stay
	const sheetMinCount = sheetInRewatch
		? (showMap.get(sheetEpisode!.tmdbShowId)?.rewatchCount ?? 0)
		: 0;

	return {
		sheetInRewatch,
		sheetMinCount,
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
		handleEpisodeCountCommit,
		handleMovieCheckmark,
		handleMovieSwipeLeft,
		handleMovieSwipeRight,
		handleMovieCountCommit,
		handleTvPress,
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
