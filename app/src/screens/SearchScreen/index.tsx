import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { View, Text, TouchableOpacity, Alert, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LoadingSpinner, shouldShowUnreleasedModal } from "../../components";
import SlidingTabs from "../../components/SlidingTabs";
import { LegendList } from "@legendapp/list/react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
	useSearch,
	useTrending,
	useTrackedIds,
	useUpcomingMutations,
	removeShowFromCalendarGlobal,
	addMovieToCalendarGlobal,
	incrementDailyWatch,
} from "../../hooks";
import { getFirestore, doc, updateDoc, Timestamp } from "@react-native-firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../../stores";
import {
	addToTracking,
	removeFromTracking,
	addAndMarkMovieWatched,
	getHighestWatchedEpisode,
} from "../../services";
import { colors } from "../../theme";
import { showDocId } from "../../utils/docId";
import { emitShowAdded, emitShowRemoved, emitShowCompleted } from "../../utils/watchlistEvents";
import { todayStr } from "../../utils/todayStr";
import { getCachedCatalogShow } from "../../hooks/useWatchlist";
import {
	TMDBShow,
	SearchStackParamList,
	MediaType,
	MediaFilter,
	Route,
	QueryKey,
	WatchStatus,
	WatchedMovie,
	UpcomingEpisode,
} from "../../types";
import { fetchFirstEpisodeInfo, buildOptimisticItem } from "./helpers";
import SearchCard from "./SearchCard";
import SearchModals from "./SearchModals";
import { styles } from "./styles";

type NavProp = NativeStackNavigationProp<SearchStackParamList, Route.SEARCH_MAIN>;

export default function SearchScreen() {
	const { top } = useSafeAreaInsets();
	const navigation = useNavigation<NavProp>();
	const route =
		useRoute<RouteProp<SearchStackParamList, Route.SEARCH_MAIN | Route.SEARCH_RESULTS>>();
	const submittedQuery = (route.params as any)?.query || "";
	const [mediaFilter, setMediaFilter] = useState<MediaFilter>(MediaFilter.ALL);

	// Collapsible header
	const headerHeight = useRef(0);
	const headerTranslateY = useRef(new Animated.Value(0)).current;
	const contentPaddingTop = useRef(new Animated.Value(0)).current;
	const lastScrollY = useRef(0);
	const headerVisible = useRef(true);
	const animating = useRef(false);

	const onHeaderLayout = useCallback(
		(e: any) => {
			headerHeight.current = e.nativeEvent.layout.height;
			contentPaddingTop.setValue(headerHeight.current);
		},
		[contentPaddingTop],
	);

	const handleScroll = useCallback(
		(e: any) => {
			const y = e.nativeEvent.contentOffset.y;
			const dy = y - lastScrollY.current;
			lastScrollY.current = y;
			const h = headerHeight.current;
			if (animating.current) return;

			if (dy > 10 && headerVisible.current && y > 50) {
				headerVisible.current = false;
				animating.current = true;
				Animated.parallel([
					Animated.timing(headerTranslateY, {
						toValue: -h,
						duration: 200,
						useNativeDriver: false,
					}),
					Animated.timing(contentPaddingTop, {
						toValue: 0,
						duration: 200,
						useNativeDriver: false,
					}),
				]).start(() => {
					animating.current = false;
				});
			} else if (dy < -10 && !headerVisible.current) {
				headerVisible.current = true;
				animating.current = true;
				Animated.parallel([
					Animated.timing(headerTranslateY, {
						toValue: 0,
						duration: 200,
						useNativeDriver: false,
					}),
					Animated.timing(contentPaddingTop, {
						toValue: h,
						duration: 200,
						useNativeDriver: false,
					}),
				]).start(() => {
					animating.current = false;
				});
			}
		},
		[headerTranslateY, contentPaddingTop],
	);

	const openSearchInput = useCallback(() => {
		navigation.navigate(Route.SEARCH_INPUT, {
			currentQuery: submittedQuery || undefined,
		});
	}, [navigation, submittedQuery]);

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
				const epInfo = await fetchFirstEpisodeInfo(item.id, apiKey);

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
			const epInfo = await fetchFirstEpisodeInfo(item.id, apiKey);
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

	const {
		data: searchData,
		isLoading: searchLoading,
		fetchNextPage,
		hasNextPage,
	} = useSearch(submittedQuery, mediaFilter);

	const { data: trending, isLoading: trendingLoading } = useTrending("all");

	const filteredTrending = trending?.filter((item) => {
		if (mediaFilter === MediaFilter.ALL) return true;
		const mt = item.media_type || (item.title ? "movie" : "tv");
		return mt === mediaFilter;
	});

	const rawDisplayData = submittedQuery.length > 0 ? searchData?.results : filteredTrending;
	const isLoading = submittedQuery.length > 0 ? searchLoading : trendingLoading;

	// Augment data with tracked/adding state so LegendList re-renders items when these change
	const displayData = useMemo(() => {
		if (!rawDisplayData) return rawDisplayData;
		return rawDisplayData.map((item) => ({
			...item,
			_tracked: trackedIds.has(item.id),
			_adding: addingIds.has(item.id),
		}));
	}, [rawDisplayData, trackedIds, addingIds]);

	const handlePress = useCallback(
		(item: TMDBShow) => {
			const mediaType: MediaType =
				item.media_type ||
				(item.first_air_date || (item.name && !item.title) ? MediaType.TV : MediaType.MOVIE);
			navigation.navigate(Route.SHOW_DETAIL, { tmdbId: item.id, mediaType });
		},
		[navigation],
	);

	const renderItem = useCallback(
		({ item }: { item: TMDBShow & { _tracked?: boolean; _adding?: boolean } }) => (
			<SearchCard
				item={item}
				isInWatchlist={!!item._tracked}
				isAdding={!!item._adding}
				onPress={handlePress}
				onAdd={handleAddToWatchlist}
				onRemove={handleRemoveFromWatchlist}
			/>
		),
		[handlePress, handleAddToWatchlist, handleRemoveFromWatchlist],
	);

	return (
		<View style={styles.container}>
			<Animated.View
				onLayout={onHeaderLayout}
				style={[
					styles.headerBlock,
					{ paddingTop: top, transform: [{ translateY: headerTranslateY }] },
				]}
			>
				<View style={styles.headerCard}>
					<View style={styles.searchBarRow}>
						{submittedQuery ? (
							<TouchableOpacity
								style={styles.backButton}
								onPress={() => navigation.navigate(Route.SEARCH_MAIN)}
								activeOpacity={0.7}
							>
								<Ionicons name="chevron-back" size={24} color={colors.text} />
							</TouchableOpacity>
						) : (
							<View style={styles.searchIconWrap}>
								<Ionicons name="search" size={18} color={colors.textMuted} />
							</View>
						)}
						<TouchableOpacity
							style={styles.searchRow}
							onPress={openSearchInput}
							activeOpacity={0.7}
						>
							<Text style={[styles.searchInput, { color: colors.textMuted }]} numberOfLines={1}>
								{submittedQuery || "Search Shows & Movies"}
							</Text>
						</TouchableOpacity>
					</View>

					<SlidingTabs
						tabs={[
							{ key: MediaFilter.ALL, label: "All" },
							{ key: MediaFilter.TV, label: "TV" },
							{ key: MediaFilter.MOVIE, label: "Movies" },
						]}
						activeKey={mediaFilter}
						onTabPress={(key) => setMediaFilter(key as MediaFilter)}
					/>
				</View>
			</Animated.View>

			<Animated.View style={{ paddingTop: contentPaddingTop }}>
				{!submittedQuery && <Text style={styles.sectionTitle}>Trending</Text>}
			</Animated.View>

			{isLoading ? (
				<View style={styles.center}>
					<LoadingSpinner />
				</View>
			) : !isLoading && submittedQuery.length > 0 && (!displayData || displayData.length === 0) ? (
				<View style={styles.center}>
					<Text style={styles.emptyText}>No results found</Text>
				</View>
			) : (
				<LegendList
					data={displayData || []}
					keyExtractor={(item) => `${item.media_type || "x"}_${item.id}`}
					renderItem={renderItem}
					numColumns={2}
					estimatedItemSize={140}
					columnWrapperStyle={styles.row}
					onScroll={handleScroll}
					scrollEventThrottle={16}
					contentContainerStyle={styles.grid}
					onEndReached={() => {
						if (submittedQuery && hasNextPage) fetchNextPage();
					}}
					onEndReachedThreshold={0.5}
					recycleItems={false}
				/>
			)}

			<SearchModals
				movieModal={movieModal}
				onMovieModalClose={() => setMovieModal(null)}
				onMovieAddOnly={handleMovieAddOnly}
				onMovieAddAndWatch={handleMovieAddAndWatch}
				removeModal={removeModal}
				removeError={removeError}
				removing={removing}
				onConfirmRemove={handleConfirmRemove}
				onRemoveModalClose={() => {
					setRemoveModal(null);
					setRemoveError(null);
				}}
				unreleasedModal={unreleasedModal}
				onUnreleasedClose={() => setUnreleasedModal(null)}
				resumeModal={resumeModal}
				onResumeFromWhere={handleResumeFromWhere}
				onStartFresh={handleStartFresh}
				onResumeModalClose={() => setResumeModal(null)}
			/>
		</View>
	);
}
