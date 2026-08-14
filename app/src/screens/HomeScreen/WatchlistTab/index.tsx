import { useCallback, useRef, useEffect, useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
	View,
	Text,
	TouchableOpacity,
	ActivityIndicator,
	RefreshControl,
	Dimensions,
	Alert,
} from "react-native";
import { LegendList } from "@legendapp/list/react-native";
import { useNavigation, CompositeNavigationProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore, useUiStore } from "../../../stores";
import {
	LoadingSpinner,
	ShowCard,
	WatchActionSheet,
	EpisodeDetailModal,
	ShowDrawer,
} from "../../../components";
import type { WatchAction, CarouselEpisode } from "../../../components";
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
import { colors } from "../../../theme";
import {
	HomeStackParamList,
	MainStackParamList,
	WatchedEpisode,
	WatchedMovie,
	MediaType,
	Route,
	QueryKey,
} from "../../../types";
import type { ShowDrawerData } from "../../../components/ShowDrawer";
import { warmupWatchlistCFs, warmupFirestoreWrite } from "../../../services/warmup";
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
import type { WatchlistListItem } from "../../../types/watchlist";
import { styles } from "./styles";
import { useWatchlistData } from "./useWatchlistData";
import WatchedEpisodeRow from "./WatchedEpisodeRow";
import SectionHeader from "./SectionHeader";

const SCREEN_HEIGHT = Dimensions.get("window").height;

type NavProp = CompositeNavigationProp<
	NativeStackNavigationProp<HomeStackParamList, Route.HOME_TABS>,
	NativeStackNavigationProp<MainStackParamList>
>;

const SeparatorComponent = () => <View style={styles.separator} />;

export default function WatchlistTab() {
	const user = useAuthStore((s) => s.user);
	const queryClient = useQueryClient();
	const navigation = useNavigation<NavProp>();

	useEffect(() => {
		warmupWatchlistCFs();
		if (user?.uid) warmupFirestoreWrite(user.uid);
	}, [user?.uid]);

	const {
		listData,
		loading,
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
	} = useWatchlistData(user?.uid);

	const listRef = useRef<any>(null);

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
	} | null>(null);
	const epModalTmdbIdRef = useRef<number | null>(null);

	// Show drawer state
	const [drawerVisible, setDrawerVisible] = useState(false);
	const [drawerShow, setDrawerShow] = useState<ShowDrawerData | null>(null);

	useEffect(() => {
		setWatchlistLoading(isLoading);
	}, [isLoading, setWatchlistLoading]);

	// Scroll to "What's Up Next" once on first load — lock offset to prevent jump on live data arrival
	const initialScrollDone = useRef(false);
	const lockedOffset = useRef(0);
	useEffect(() => {
		if (!initialScrollDone.current && !isLoading && prevWatchedOffset > 0) {
			initialScrollDone.current = true;
			lockedOffset.current = prevWatchedOffset;
			setTimeout(() => {
				listRef.current?.scrollToOffset({
					offset: prevWatchedOffset,
					animated: true,
				});
			}, 400);
		}
	}, [isLoading, prevWatchedOffset]);

	// Re-scroll on every tab focus (not just first load)
	useEffect(() => {
		const parent = navigation.getParent();
		if (!parent) return;
		const unsub = parent.addListener("focus", () => {
			if (prevWatchedOffset > 0) {
				setTimeout(() => {
					listRef.current?.scrollToOffset({
						offset: prevWatchedOffset,
						animated: true,
					});
				}, 100);
			}
		});
		return unsub;
	}, [navigation, prevWatchedOffset]);

	const handleNavigateToShow = useCallback(
		(tmdbId: number, mediaType: MediaType) => {
			navigation.navigate(Route.SHOW_DETAIL, { tmdbId, mediaType });
		},
		[navigation],
	);

	const handleCardPress = useCallback(
		async (tmdbId: number, _mediaType: MediaType) => {
			const listItem = listData.find((li) => li.type === "show" && li.item.tmdbId === tmdbId);
			if (!listItem || listItem.type !== "show") return;
			const item = listItem.item;
			const ep = item.nextEpisode;
			if (!ep) return;

			const catalog = item.catalogShow;
			const today = new Date().toISOString().split("T")[0];

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

			// Find initial index
			const initialIdx = allEps.findIndex(
				(e) => e.season === ep.season && e.episode === ep.episode,
			);

			// Build watched keys from query cache
			// Fetch ALL watched episodes for this show (complete + correct counts)
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
				episodes: allEps,
				initialIndex: Math.max(0, initialIdx),
				watchedKeys: wKeys,
				currentNextEpisode: ep,
			});
			setEpModalVisible(true);
		},
		[listData, user?.uid, queryClient],
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

	const renderItem = useCallback(
		({ item }: { item: WatchlistListItem }) => {
			if (item.type === "sectionHeader") {
				return <SectionHeader title={item.title} />;
			}

			if (item.type === "watchedMovie") {
				return (
					<ShowCard
						item={
							{
								...item.show,
								nextEpisode: null,
								mediaType: MediaType.MOVIE,
								rewatchCount: item.show.rewatchCount ?? 0,
								director: item.show.catalogShow?.credits?.directors?.[0] ?? null,
							} as any
						}
						isWatched
						watchCount={item.movie.watchCount ?? 0}
						onSwipeLeft={() => handleMovieSwipeLeft(item.movie)}
						onSwipeRight={() => handleMovieSwipeRight(item.movie)}
						onPress={(id) => handleNavigateToShow(id, MediaType.MOVIE)}
						onCheckmark={async () => handleMovieCheckmark(item.movie, item.show.title)}
					/>
				);
			}

			if (item.type === "watchedEpisode") {
				return (
					<WatchedEpisodeRow
						episode={item.episode}
						show={item.show}
						onPress={handleTvPress}
						onCheckmarkPress={handleWatchedCheckmark}
						onSwipeLeft={handleWatchedSwipeLeft}
						onSwipeRight={handleWatchedSwipeRight}
					/>
				);
			}

			// All fields pre-computed in useWatchlistData — no catalog lookup needed
			return (
				<ShowCard
					item={item.item}
					isUpdating={updatingShows.has(item.item.tmdbId)}
					remainingEpisodes={(item.item as any).remaining ?? null}
					onSwipeLeft={handleMarkWatched}
					onSwipeRight={handleStopWatching}
					onPress={handleCardPress}
					onTitlePress={handleTitlePress}
					onCheckmark={handleMarkWatched}
				/>
			);
		},
		[
			handleMarkWatched,
			handleStopWatching,
			handleCardPress,
			handleTitlePress,
			handleTvPress,
			watchedCountByShow,
			updatingShows,
			handleWatchedCheckmark,
			handleWatchedSwipeLeft,
			handleWatchedSwipeRight,
			handleMovieCheckmark,
			handleMovieSwipeLeft,
			handleMovieSwipeRight,
		],
	);

	const stableOffset = initialScrollDone.current ? lockedOffset.current : prevWatchedOffset;
	const contentStyle = useMemo(
		() => [styles.listContent, { minHeight: SCREEN_HEIGHT + stableOffset }],
		[stableOffset],
	);

	const stickyIndices = useMemo(
		() =>
			listData.reduce<number[]>((acc, item, i) => {
				if (item.type === "sectionHeader") acc.push(i);
				return acc;
			}, []),
		[listData],
	);

	if (isLoading) {
		return (
			<View style={styles.center}>
				<LoadingSpinner />
			</View>
		);
	}

	if (listData.length === 0) {
		return (
			<View style={styles.center}>
				<Text style={styles.empty}>No shows in your watchlist</Text>
				<TouchableOpacity
					style={styles.addShowsButton}
					onPress={() => navigation.navigate(Route.SWIPE_TABS, { screen: Route.SEARCH })}
				>
					<Text style={styles.addShowsText}>+ Add Shows</Text>
				</TouchableOpacity>
			</View>
		);
	}

	const sheetLabel = sheetEpisode
		? `S${String(sheetEpisode.season).padStart(2, "0")}E${String(sheetEpisode.episode).padStart(2, "0")} - ${sheetEpisode.episodeTitle}`
		: "";

	return (
		<>
			<LegendList
				ref={listRef}
				data={listData}
				keyExtractor={(item) => {
					if (item.type === "sectionHeader") return `section_${item.title}`;
					if (item.type === "watchedMovie") return `movie_${item.movie.id}`;
					if (item.type === "watchedEpisode") return `watched_${item.episode.id}`;
					return `show_${item.item.id}`;
				}}
				renderItem={renderItem}
				recycleItems
				drawDistance={SCREEN_HEIGHT * 2}
				estimatedItemSize={110}
				stickyHeaderIndices={stickyIndices}
				refreshControl={
					hasMorePrevWatched ? (
						<RefreshControl
							refreshing={loadingMorePrevWatched}
							onRefresh={loadMorePrevWatched}
							tintColor={colors.primary}
							colors={[colors.primary]}
							progressBackgroundColor={colors.surface}
						/>
					) : undefined
				}
				onEndReached={() => loadMoreTracking()}
				onEndReachedThreshold={1.5}
				ListFooterComponent={
					loadingMoreTracking ? (
						<View style={styles.loaderRow}>
							<ActivityIndicator size="small" color={colors.primary} />
						</View>
					) : null
				}
				ItemSeparatorComponent={SeparatorComponent}
				maintainVisibleContentPosition={{ data: true, size: true }}
				style={styles.list}
				contentContainerStyle={contentStyle}
			/>
			<WatchActionSheet
				visible={sheetVisible}
				label={sheetLabel}
				watchCount={sheetEpisode?.watchCount || 0}
				onSelect={handleSheetAction}
				onClose={() => {
					setSheetVisible(false);
					setSheetEpisode(null);
				}}
			/>
			<WatchActionSheet
				visible={movieSheetVisible}
				label={sheetMovieTitle || "Movie"}
				watchCount={sheetMovie?.watchCount || 0}
				onSelect={handleMovieSheetAction}
				onClose={() => {
					setMovieSheetVisible(false);
					setSheetMovie(null);
				}}
			/>
			{epModalData && (
				<EpisodeDetailModal
					visible={epModalVisible}
					tmdbId={epModalData.tmdbId}
					showTitle={epModalData.showTitle}
					showPosterPath={epModalData.showPosterPath}
					showBackdropPath={epModalData.showBackdropPath}
					episodes={epModalData.episodes}
					initialIndex={epModalData.initialIndex}
					watchedKeys={epModalData.watchedKeys}
					currentNextEpisode={epModalData.currentNextEpisode}
					onMarkWatched={handleCarouselMarkWatched}
					onMarkWatchedThrough={handleMarkWatchedThrough}
					onUnmarkWatched={handleUnmarkEpisode}
					onShowPress={handleEpModalShowPress}
					onClose={() => {
						setEpModalVisible(false);
						setEpModalData(null);
					}}
					onLoadEpisodeDetails={handleLoadEpisodeDetails}
				/>
			)}
			<ShowDrawer
				visible={drawerVisible}
				show={drawerShow}
				onGoToShow={
					drawerShow?.tmdbId
						? () => {
								const id = drawerShow.tmdbId!;
								const mt = drawerShow.mediaType === "movie" ? MediaType.MOVIE : MediaType.TV;
								setDrawerVisible(false);
								setDrawerShow(null);
								handleNavigateToShow(id, mt);
							}
						: undefined
				}
				onClose={() => {
					setDrawerVisible(false);
					setDrawerShow(null);
				}}
			/>
		</>
	);
}
