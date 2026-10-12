import { useState, useCallback, useRef, useMemo } from "react";
import { View, Text, TouchableOpacity, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LoadingSpinner } from "../../components";
import SlidingTabs from "../../components/SlidingTabs";
import NotFoundArt from "../../components/NotFoundArt";
import { LegendList } from "@legendapp/list/react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSearch, useTrending } from "../../hooks";
import { colors } from "../../theme";
import { TMDBShow, SearchStackParamList, MediaType, MediaFilter, Route } from "../../types";
import { useSearchActions } from "./useSearchActions";
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

	const {
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
		handleAddToWatchlist,
		handleRemoveFromWatchlist,
		handleConfirmRemove,
		handleMovieAddOnly,
		handleMovieAddAndWatch,
		handleResumeFromWhere,
		handleStartFresh,
		setResumeModal,
	} = useSearchActions();

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
				<View style={styles.emptyWrap}>
					<NotFoundArt />
					<Text style={styles.emptyText}>No results found</Text>
					<Text style={styles.emptyHint}>Try a different title or check the spelling</Text>
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
