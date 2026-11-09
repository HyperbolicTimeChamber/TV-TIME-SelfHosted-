import { useState, useCallback, useRef, useMemo, useLayoutEffect } from "react";
import { View, Text, TouchableOpacity, useWindowDimensions, Keyboard } from "react-native";
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import Animated, {
	Easing,
	useAnimatedReaction,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import SlidingTabs from "../../components/SlidingTabs";
import NotFoundArt, {
	NO_RESULTS_ART,
	NO_RESULTS_RATIO,
	artHeight,
} from "../../components/NotFoundArt";

const artReserve = artHeight(NO_RESULTS_RATIO) + 24;
import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { useFocusEffect, useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
	useSearch,
	useSearchSort,
	useSortedSearchResults,
	useTrending,
	useCustomLists,
	useCustomListView,
} from "../../hooks";
import { useAuthStore } from "../../stores";
import { AddToListSheet } from "../../components";
import { listedTitleKeys, listItemKey, searchMediaType, entryFromSearchResult } from "../../utils";
import { colors, spacing } from "../../theme";
import { TMDBShow, SearchStackParamList, MediaType, MediaFilter, Route } from "../../types";
import { CacheKey, CustomListView } from "../../enums";
import { SORT_FAB_CLEARANCE } from "../../components/SortFab";
import SortFabMenu from "../../components/SortFabMenu";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import type { SortOption } from "../../components/SortSheet";
import {
	SEARCH_SORT_OPTIONS,
	sameSearchSort,
	DEFAULT_SEARCH_SORT,
	type SearchSortView,
} from "../../utils/searchSort";
import { useSearchActions } from "./useSearchActions";
import SearchCard from "./SearchCard";
import SearchSkeleton from "./SearchSkeleton";
import ErrorState from "../../components/ErrorState";
import { describeSearchError } from "../../utils";
import SearchModals from "./SearchModals";
import { CLEAR_ICON_SIZE, ROW_HEIGHT, styles } from "./styles";
import { IoIosCloseCircle } from "../../components/HiIcons";

const SORT_OPTIONS: SortOption<SearchSortView>[] = SEARCH_SORT_OPTIONS.map(
	({ label, ...value }) => ({ value, label }),
);
const FAB_BOTTOM = 20;
/** Re-sorting swaps the whole order, and a virtualized grid can't glide cards to new slots:
 *  the results fade down, swap, and settle back in (occasional action, so both halves stay short) */
const SORT_OUT_MS = 100;
const SORT_IN_MS = 220;
const SORT_SETTLE_OFFSET = 10;
const SORT_EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Placeholder cards while results load (enough to fill the screen) / under the list while
 *  more batches are to come (one row) */
const LOADING_CARDS = 6;
const COLUMNS = 2;
const HEADER_SNAP_MS = 180;

type SearchItem = TMDBShow & {
	_tracked: boolean;
	_adding: boolean;
	_listed: boolean;
	_skeleton?: boolean;
};

const keyExtractor = (item: SearchItem) =>
	item._skeleton ? `skeleton_${item.id}` : `${item.media_type || "x"}_${item.id}`;

/** Placeholder list items: drawn as SearchSkeleton cards, in the same grid as the results */
const skeletonItems = (count: number): SearchItem[] =>
	Array.from({ length: count }, (_, id) => ({
		id,
		_skeleton: true,
		_tracked: false,
		_adding: false,
	})) as SearchItem[];
const LOADING_ITEMS = skeletonItems(LOADING_CARDS);
// Fills an odd last row, then one full row
const MORE_ITEMS = [skeletonItems(COLUMNS), skeletonItems(COLUMNS + 1)];
// List view: two placeholder rows
const MORE_ROWS = skeletonItems(2);

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
	// Grid / List, remembered across launches (Trending and results share it)
	const [view, setView] = useCustomListView(CacheKey.SEARCH_VIEW, CustomListView.GRID);
	const isGrid = view === CustomListView.GRID;
	const listRef = useRef<any>(null);
	const reducedMotion = useReducedMotion();
	// 1 = results shown; fades to 0 as a new sort is chosen, back to 1 once it has been applied
	const sortFade = useSharedValue(1);
	const sortFadeStyle = useAnimatedStyle(() => ({
		opacity: sortFade.get(),
		transform: [{ translateY: (1 - sortFade.get()) * SORT_SETTLE_OFFSET }],
	}));
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

	const applySort = useCallback(
		(next: SearchSortView) => {
			setSortView(next);
			// New order starts from the top, header shown
			listRef.current?.scrollToOffset({ offset: 0, animated: false });
			headerY.value = 0;
		},
		[setSortView, headerY],
	);
	const chooseSort = useCallback(
		(next: SearchSortView) => {
			// Same sort again changes nothing, so nothing would fade the results back in
			if (sameSearchSort(next, sortView)) return;
			if (reducedMotion) {
				applySort(next);
				return;
			}
			sortFade.set(
				withTiming(0, { duration: SORT_OUT_MS, easing: SORT_EASE_OUT }, (finished) => {
					"worklet";
					// Not finished = something else took over the fade (a newer pick): that one applies its own
					if (finished) scheduleOnRN(applySort, next);
				}),
			);
		},
		[reducedMotion, sortView, applySort, sortFade],
	);
	// The new order is in: settle the results back in (not on first mount)
	const shownSort = useRef(sortView);
	useLayoutEffect(() => {
		if (shownSort.current === sortView) return;
		shownSort.current = sortView;
		sortFade.set(withTiming(1, { duration: SORT_IN_MS, easing: SORT_EASE_OUT }));
	}, [sortView, sortFade]);
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
	// The input screen is replaced by this one while its keyboard is up; on Android the replace can
	// leave the keyboard showing over the results, so close it once the results page is in front
	// Once on focus and again when the screen transition ends: a dismiss that lands mid-replace is
	// lost on some runs (keyboard stayed up over the results)
	useFocusEffect(
		useCallback(() => {
			if (!submittedQuery) return;
			Keyboard.dismiss();
			return navigation.addListener("transitionEnd", () => Keyboard.dismiss());
		}, [submittedQuery, navigation]),
	);

	// The input opens over this page, so backing out of it returns here, whatever was typed. A new
	// search replaces these results (SearchInputScreen): only ever one results page above Trending
	const openSearchInput = useCallback(() => {
		navigation.push(Route.SEARCH_INPUT, { currentQuery: submittedQuery || undefined });
	}, [navigation, submittedQuery]);
	// ✕ on a results page: the suggestions page opens empty, over these results like openSearchInput
	const clearSearch = useCallback(() => {
		navigation.push(Route.SEARCH_INPUT, { currentQuery: undefined });
	}, [navigation]);

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
		error: searchError,
		refetch: retrySearch,
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

	// A page loaded while scrolling is appended in order, not merged in above the scroll position
	const sortedResults = useSortedSearchResults(
		searchData?.results,
		sortView,
		`${submittedQuery}|${mediaFilter}`,
	);

	const rawDisplayData = submittedQuery.length > 0 ? sortedResults : filteredTrending;
	const isLoading = submittedQuery.length > 0 ? searchLoading : trendingLoading;

	// Augment data with tracked/adding state so LegendList re-renders items when these change.
	// Augmented items are reused per source item while their flags are unchanged — a fresh
	// object per item would re-render every card on each page append, re-sort or add/remove
	const augmented = useRef(new WeakMap<TMDBShow, SearchItem>());
	const resultItems = useMemo(() => {
		if (!rawDisplayData) return rawDisplayData;
		const cache = augmented.current;
		return rawDisplayData.map((item) => {
			const tracked = trackedIds.has(item.id);
			const adding = addingIds.has(item.id);
			const listed = listedKeys.has(listItemKey(item.id, searchMediaType(item)));
			const prev = cache.get(item);
			if (prev && prev._tracked === tracked && prev._adding === adding && prev._listed === listed)
				return prev;
			const next: SearchItem = { ...item, _tracked: tracked, _adding: adding, _listed: listed };
			cache.set(item, next);
			return next;
		});
	}, [rawDisplayData, trackedIds, addingIds, listedKeys]);
	const moreToLoad = !!submittedQuery && !!hasNextPage;
	const displayData = useMemo(() => {
		if (isLoading) return LOADING_ITEMS;
		if (!resultItems || !moreToLoad) return resultItems;
		return [...resultItems, ...(isGrid ? MORE_ITEMS[resultItems.length % COLUMNS] : MORE_ROWS)];
	}, [isLoading, resultItems, moreToLoad, isGrid]);

	// Posters are 2:3 and fill the column — a close estimate keeps LegendList from
	// re-positioning rows as real sizes come in (was 140, about half the real height)
	const { width: windowWidth } = useWindowDimensions();
	const estimatedItemSize = useMemo(() => {
		if (!isGrid) return ROW_HEIGHT + spacing.sm;
		const cardWidth = (windowWidth - 2 * spacing.lg - 3 * spacing.sm) / 2;
		return Math.round(cardWidth * 1.5 + spacing.xs);
	}, [windowWidth, isGrid]);

	const onEndReached = useCallback(() => {
		if (submittedQuery && hasNextPage) fetchNextPage();
	}, [submittedQuery, hasNextPage, fetchNextPage]);

	const showSort = submittedQuery.length > 0 && !isLoading && !!resultItems?.length;

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
		({ item }: { item: SearchItem }) =>
			item._skeleton ? (
				<SearchSkeleton layout={view} />
			) : (
				<SearchCard
					item={item}
					layout={view}
					isInWatchlist={item._tracked}
					isAdding={item._adding}
					isListed={item._listed}
					onPress={handlePress}
					onAdd={handleAddToWatchlist}
					onRemove={handleRemoveFromWatchlist}
					onAddToList={setListTarget}
				/>
			),
		[handlePress, handleAddToWatchlist, handleRemoveFromWatchlist, view],
	);

	// The other layout mounts fresh at the top, so the header comes back with it
	const toggleView = useCallback(() => {
		setView(isGrid ? CustomListView.LIST : CustomListView.GRID);
		headerY.value = 0;
	}, [isGrid, setView, headerY]);

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
							{submittedQuery ? (
								<TouchableOpacity
									style={styles.clearButton}
									onPress={clearSearch}
									hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
									accessibilityLabel="Clear search"
								>
									<IoIosCloseCircle size={CLEAR_ICON_SIZE} color={colors.textMuted} />
								</TouchableOpacity>
							) : null}
							<TouchableOpacity
								style={styles.viewToggle}
								onPress={toggleView}
								hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
								accessibilityLabel={isGrid ? "Show as list" : "Show as grid"}
							>
								<Ionicons name={isGrid ? "list" : "grid"} size={20} color={colors.text} />
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

			<Animated.View style={[styles.content, sortFadeStyle]}>
				{!isLoading && submittedQuery.length > 0 && searchError && !resultItems?.length ? (
					// Failed (busy / offline), not empty: say so, with a retry
					<View style={[styles.errorWrap, { paddingTop: headerH }]}>
						<ErrorState
							info={describeSearchError(searchError)}
							mediaType={MediaType.TV}
							primary={{ label: "Try Again", onPress: () => retrySearch() }}
						/>
					</View>
				) : !isLoading && submittedQuery.length > 0 && !resultItems?.length ? (
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
						// Columns can't change on a mounted list: each layout is its own list
						key={view}
						data={displayData || []}
						keyExtractor={keyExtractor}
						renderItem={renderItem}
						numColumns={isGrid ? COLUMNS : 1}
						estimatedItemSize={estimatedItemSize}
						columnWrapperStyle={isGrid ? styles.row : undefined}
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
			</Animated.View>

			{showSort && (
				<SortFabMenu
					bottom={FAB_BOTTOM}
					options={SORT_OPTIONS}
					selected={sortView}
					isSame={sameSearchSort}
					onSelect={chooseSort}
					customised={!sameSearchSort(sortView, DEFAULT_SEARCH_SORT)}
					accessibilityLabel="Sort results"
				/>
			)}

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
