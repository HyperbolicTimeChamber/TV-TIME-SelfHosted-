import { useState, useCallback, useRef, useMemo } from "react";
import { View, Text, TouchableOpacity, useWindowDimensions } from "react-native";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import Animated, {
	useAnimatedReaction,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LoadingSpinner } from "../../components";
import SlidingTabs from "../../components/SlidingTabs";
import NotFoundArt, {
	NO_RESULTS_ART,
	NO_RESULTS_RATIO,
	artHeight,
} from "../../components/NotFoundArt";

const artReserve = artHeight(NO_RESULTS_RATIO) + 24;
import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSearch, useSearchSort, useTrending, useCustomLists } from "../../hooks";
import { useAuthStore } from "../../stores";
import { AddToListSheet } from "../../components";
import { listedTitleKeys, listItemKey, searchMediaType, entryFromSearchResult } from "../../utils";
import { colors, spacing } from "../../theme";
import { TMDBShow, SearchStackParamList, MediaType, MediaFilter, Route } from "../../types";
import SortFab, { SORT_FAB_CLEARANCE } from "../../components/SortFab";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import SortSheet, { type SortOption } from "../../components/SortSheet";
import {
	SEARCH_SORT_OPTIONS,
	sameSearchSort,
	sortSearchResults,
	DEFAULT_SEARCH_SORT,
	type SearchSortView,
} from "../../utils/searchSort";
import { useSearchActions } from "./useSearchActions";
import SearchCard from "./SearchCard";
import SearchModals from "./SearchModals";
import { styles } from "./styles";

const SORT_OPTIONS: SortOption<SearchSortView>[] = SEARCH_SORT_OPTIONS.map(
	({ label, ...value }) => ({ value, label }),
);
const FAB_BOTTOM = 20;
const HEADER_SNAP_MS = 180;

type SearchItem = TMDBShow & { _tracked: boolean; _adding: boolean; _listed: boolean };

const keyExtractor = (item: SearchItem) => `${item.media_type || "x"}_${item.id}`;

type NavProp = NativeStackNavigationProp<SearchStackParamList, Route.SEARCH_MAIN>;

const FILTER_TABS = [
	{ key: MediaFilter.ALL, label: "All" },
	{ key: MediaFilter.TV, label: "TV" },
	{ key: MediaFilter.MOVIE, label: "Movies" },
];

// Scrolls with the grid (header block floats over the list's top spacer)
const TRENDING_TITLE = <Text style={styles.listTitle}>Trending</Text>;

export default function SearchScreen() {
	const { top } = useSafeAreaInsets();
	const navigation = useNavigation<NavProp>();
	const route =
		useRoute<RouteProp<SearchStackParamList, Route.SEARCH_MAIN | Route.SEARCH_RESULTS>>();
	const submittedQuery = (route.params as any)?.query || "";
	const [mediaFilter, setMediaFilter] = useState<MediaFilter>(MediaFilter.ALL);
	// Results only (Trending keeps its own order); remembered for the session
	const [sortView, setSortView] = useSearchSort();
	const [sortOpen, setSortOpen] = useState(false);
	const listRef = useRef<any>(null);
	// Custom lists: which results are already in one, and the title the "Add to List" sheet is open for
	const user = useAuthStore((s) => s.user);
	const { lists } = useCustomLists(user?.uid);
	const listedKeys = useMemo(() => listedTitleKeys(lists), [lists]);
	const [listTarget, setListTarget] = useState<TMDBShow | null>(null);
	const listEntry = useMemo(
		() => (listTarget ? entryFromSearchResult(listTarget) : null),
		[listTarget],
	);
	// No-results art sits at the visible bottom; the message stays above it
	const [artOverhang, setArtOverhang] = useState(0);

	// Collapsing header ("diffClamp"): the header floats over the list's top padding and follows
	// every scroll delta on the UI thread — translateY = clamp(prev - dy, -h, 0) — then snaps
	// fully shown/hidden when the scroll settles. No JS work or React state per frame.
	const [headerH, setHeaderH] = useState(0);
	const headerHeight = useSharedValue(0);
	const headerY = useSharedValue(0);
	const scrollY = useSharedValue(0);
	// Stable object — AnimatedLegendList re-subscribes when it changes
	const listSharedValues = useMemo(() => ({ scrollOffset: scrollY }), [scrollY]);

	useAnimatedReaction(
		() => scrollY.value,
		(y, prev) => {
			if (prev === null) return;
			const h = headerHeight.value;
			// Ignore the top overscroll bounce (negative offsets)
			const dy = Math.max(y, 0) - Math.max(prev, 0);
			// dy 0 would still cancel a running snap animation
			if (!h || dy === 0) return;
			headerY.value = Math.min(0, Math.max(-h, headerY.value - dy));
		},
	);

	const headerStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: headerY.value }],
	}));

	const onHeaderLayout = useCallback(
		(e: LayoutChangeEvent) => {
			const h = e.nativeEvent.layout.height;
			headerHeight.value = h;
			setHeaderH(h);
		},
		[headerHeight],
	);

	// Scroll settled: finish a half-hidden header. Only hide when the list is scrolled past the
	// header, or its top padding would show as an empty band.
	const snapHeader = useCallback(() => {
		const h = headerHeight.value;
		const y = headerY.value;
		if (!h || y === 0 || y === -h) return;
		const hide = y < -h / 2 && scrollY.value >= h;
		headerY.value = withTiming(hide ? -h : 0, { duration: HEADER_SNAP_MS });
	}, [headerHeight, headerY, scrollY]);

	// A fling's momentum keeps moving the header — snap when it ends instead
	const onScrollEndDrag = useCallback(
		(e: NativeSyntheticEvent<NativeScrollEvent>) => {
			if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) snapHeader();
		},
		[snapHeader],
	);

	// goBack, not navigate(SEARCH_MAIN): the stack is only [SEARCH_MAIN, SEARCH_RESULTS], so
	// both land on Trending, but a NAVIGATE action is resolved into a pop by the navigator and
	// react-native-screens animates that differently from a plain GO_BACK
	// goBack, not navigate(SEARCH_MAIN). The stack is only [SEARCH_MAIN, SEARCH_RESULTS] so both
	// land on Trending, but a NAVIGATE action is resolved into a pop by the navigator and
	// react-native-screens runs a second transition for it: measured on a Pixel 9 Pro, the
	// screen settled and then changed again 215ms later. GO_BACK is the single transition.
	const backToMain = useCallback(() => {
		if (navigation.canGoBack()) navigation.goBack();
		else navigation.navigate(Route.SEARCH_MAIN);
	}, [navigation]);
	const swipeBack = useSwipeBackPop(navigation);

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
		watchedBlock,
		setWatchedBlock,
		removing,
		removeError,
		setRemoveError,
		unreleasedModal,
		setUnreleasedModal,
		resumeModal,
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
		setResumeModal,
	} = useSearchActions();

	const {
		data: searchData,
		isLoading: searchLoading,
		fetchNextPage,
		hasNextPage,
	} = useSearch(submittedQuery, mediaFilter);

	const { data: trending, isLoading: trendingLoading } = useTrending("all");

	// Memoized: a new array each render would re-map displayData and re-render every card
	const filteredTrending = useMemo(
		() =>
			trending?.filter((item) => {
				if (mediaFilter === MediaFilter.ALL) return true;
				const mt = item.media_type || (item.title ? "movie" : "tv");
				return mt === mediaFilter;
			}),
		[trending, mediaFilter],
	);

	// Sorts every loaded page — a new page merges into the sorted order
	const sortedResults = useMemo(
		() => searchData?.results && sortSearchResults(searchData.results, sortView),
		[searchData?.results, sortView],
	);

	const rawDisplayData = submittedQuery.length > 0 ? sortedResults : filteredTrending;
	const isLoading = submittedQuery.length > 0 ? searchLoading : trendingLoading;

	// Augment data with tracked/adding state so LegendList re-renders items when these change.
	// Augmented items are reused per source item while their flags are unchanged — a fresh
	// object per item would re-render every card on each page append, re-sort or add/remove
	const augmented = useRef(new WeakMap<TMDBShow, SearchItem>());
	const displayData = useMemo(() => {
		if (!rawDisplayData) return rawDisplayData;
		const cache = augmented.current;
		return rawDisplayData.map((item) => {
			const tracked = trackedIds.has(item.id);
			const adding = addingIds.has(item.id);
			const listed = listedKeys.has(listItemKey(item.id, searchMediaType(item)));
			const prev = cache.get(item);
			if (
				prev &&
				prev._tracked === tracked &&
				prev._adding === adding &&
				prev._listed === listed
			)
				return prev;
			const next: SearchItem = { ...item, _tracked: tracked, _adding: adding, _listed: listed };
			cache.set(item, next);
			return next;
		});
	}, [rawDisplayData, trackedIds, addingIds, listedKeys]);

	// Posters are 2:3 and fill the column — a close estimate keeps LegendList from
	// re-positioning rows as real sizes come in (was 140, about half the real height)
	const { width: windowWidth } = useWindowDimensions();
	const estimatedItemSize = useMemo(() => {
		const cardWidth = (windowWidth - 2 * spacing.lg - 3 * spacing.sm) / 2;
		return Math.round(cardWidth * 1.5 + spacing.xs);
	}, [windowWidth]);

	const onEndReached = useCallback(() => {
		if (submittedQuery && hasNextPage) fetchNextPage();
	}, [submittedQuery, hasNextPage, fetchNextPage]);

	const showSort = submittedQuery.length > 0 && !isLoading && !!displayData?.length;

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
		({ item }: { item: SearchItem }) => (
			<SearchCard
				item={item}
				isInWatchlist={item._tracked}
				isAdding={item._adding}
				isListed={item._listed}
				onPress={handlePress}
				onAdd={handleAddToWatchlist}
				onRemove={handleRemoveFromWatchlist}
				onAddToList={setListTarget}
			/>
		),
		[handlePress, handleAddToWatchlist, handleRemoveFromWatchlist],
	);

	// The floating header's height is a spacer at the top of the scrolling content, not top
	// padding: Android clips a scroll view's children to its padding, so cards vanished at the
	// island's bottom edge instead of passing under it (black corners around the island)
	const listHeader = useMemo(
		() => (
			<View style={{ paddingTop: headerH + (submittedQuery ? spacing.sm : 0) }}>
				{!submittedQuery && TRENDING_TITLE}
			</View>
		),
		[headerH, submittedQuery],
	);

	const screen = (
		<>
			<Animated.View
				onLayout={onHeaderLayout}
				style={[styles.headerBlock, { paddingTop: top }, headerStyle]}
			>
				<View style={styles.headerCardWrap}>
					{/* Black from the screen top to the island's middle: nothing shows above it, only
					    around its rounded bottom corners. Rides along with the collapsing header */}
					<View
						pointerEvents="none"
						style={[styles.headerBackdrop, { top: -(top + spacing.md) }]}
					/>
					<View style={styles.headerCard}>
						<View style={styles.searchBarRow}>
							{submittedQuery ? (
								<TouchableOpacity
									style={styles.backButton}
									onPress={backToMain}
									activeOpacity={0.7}
									hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
									accessibilityLabel="Back"
								>
									<Ionicons name="chevron-back-circle-outline" size={30} color={colors.text} />
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
							tabs={FILTER_TABS}
							activeKey={mediaFilter}
							onTabPress={(key) => setMediaFilter(key as MediaFilter)}
						/>
					</View>
				</View>
			</Animated.View>

			<View style={styles.content}>
				{isLoading ? (
					<View style={[styles.center, { paddingTop: headerH }]}>
						<LoadingSpinner />
					</View>
				) : !isLoading &&
				  submittedQuery.length > 0 &&
				  (!displayData || displayData.length === 0) ? (
					<View
						style={[
							styles.emptyWrap,
							{ paddingTop: headerH, paddingBottom: artReserve + artOverhang },
						]}
					>
						<NotFoundArt
							source={NO_RESULTS_ART}
							ratio={NO_RESULTS_RATIO}
							onOverhang={setArtOverhang}
						/>
						<Text style={styles.emptyText}>NOTHING FOUND</Text>
						<Text style={styles.emptyHint}>
							Searched the database, but nothing happened. Have you lost the way?
						</Text>
					</View>
				) : (
					<AnimatedLegendList
						ref={listRef}
						data={displayData || []}
						keyExtractor={keyExtractor}
						renderItem={renderItem}
						numColumns={2}
						estimatedItemSize={estimatedItemSize}
						columnWrapperStyle={styles.row}
						sharedValues={listSharedValues}
						onScrollEndDrag={onScrollEndDrag}
						onMomentumScrollEnd={snapHeader}
						ListHeaderComponent={listHeader}
						contentContainerStyle={[
							styles.grid,
							{
								paddingTop: 0,
								paddingBottom: showSort ? FAB_BOTTOM + SORT_FAB_CLEARANCE : 0,
							},
						]}
						onEndReached={onEndReached}
						onEndReachedThreshold={0.5}
						// Cards hold no state and expo-image has a recyclingKey — reusing views
						// avoids a full card mount for every row scrolled in
						recycleItems
					/>
				)}
			</View>

			{showSort && (
				<SortFab
					bottom={FAB_BOTTOM}
					onPress={() => setSortOpen(true)}
					customised={!sameSearchSort(sortView, DEFAULT_SEARCH_SORT)}
					accessibilityLabel="Sort results"
				/>
			)}
			<SortSheet
				visible={sortOpen}
				onClose={() => setSortOpen(false)}
				options={SORT_OPTIONS}
				selected={sortView}
				isSame={sameSearchSort}
				onSelect={(next) => {
					setSortView(next);
					setSortOpen(false);
					// New order starts from the top, header shown
					listRef.current?.scrollToOffset({ offset: 0, animated: false });
					headerY.value = 0;
				}}
			/>

			<AddToListSheet entry={listEntry} onClose={() => setListTarget(null)} />

			<SearchModals
				movieModal={movieModal}
				onMovieModalClose={() => setMovieModal(null)}
				onMovieAddOnly={handleMovieAddOnly}
				onMovieAddAndWatch={handleMovieAddAndWatch}
				removeModal={removeModal}
				removeError={removeError}
				watchedBlock={watchedBlock}
				onGoToShow={(item) => {
					setWatchedBlock(null);
					handlePress(item);
				}}
				onWatchedBlockClose={() => setWatchedBlock(null)}
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
				addFailure={addFailure}
				onRetryAdd={retryAdd}
				onAddFailureClose={dismissAddFailure}
			/>
		</>
	);

	// Results: right swipe anywhere slides back to Trending (transparent modal route, so it
	// shows underneath). Vertical drags fail the pan, so the list scroll / header collapse win
	return submittedQuery ? (
		<SwipeBackView onBack={backToMain} {...swipeBack} style={styles.container}>
			{screen}
		</SwipeBackView>
	) : (
		<View style={styles.container}>{screen}</View>
	);
}
