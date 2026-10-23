import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LegendList } from "@legendapp/list/react-native";
import { LinearGradient } from "expo-linear-gradient";
import SlidingTabs from "../../../components/SlidingTabs";
import { CircleBackButton } from "../../../components/CircleButton";
import { useSharedShimmer } from "../../../components/SkeletonLine";
import { useWatchHistory } from "../../../hooks";
import { useHistorySort } from "../../../hooks/useWatchHistory";
import { CircleButtonTone, HistoryFilter, HistorySort, MediaType, Route } from "../../../enums";
import type { ProfileStackParamList } from "../../../types";
import type { HistoryCard } from "../../../utils";
import SortFab, { SORT_FAB_CLEARANCE } from "../../../components/SortFab";
import HistoryViewSheet from "./HistoryViewSheet";
import { colors } from "../../../theme";
import HistoryCardView from "./HistoryCardView";
import HistoryCardSkeleton from "./HistoryCardSkeleton";
import HistoryEmpty from "./HistoryEmpty";
import { styles } from "./styles";

type Nav = NativeStackNavigationProp<ProfileStackParamList>;

const TABS = [
	{ key: MediaType.TV, label: "TV Shows" },
	{ key: MediaType.MOVIE, label: "Movies" },
];
const SKELETONS = [0, 1, 2];
// Tab pager — same feel as Home's Watch List / Upcoming swipe
const SLIDE_MS = 250;
const START_PX = 25;
const TURN_SHARE = 0.3;
const FLICK_VELOCITY = 500;
/** TV Shows: a rightward drag pulls the whole page this much per px, then pops on release */
const BACK_PULL = 0.35;

/** One tab's list — mounted once its page is first shown, so an unseen tab doesn't fetch */
function HistoryList({
	mediaType,
	sort,
	filters,
	bottomInset,
}: {
	mediaType: MediaType;
	sort: HistorySort;
	filters: ReadonlySet<HistoryFilter>;
	/** Room for the floating sort/filter button */
	bottomInset: number;
}) {
	const navigation = useNavigation<Nav>();
	// Sort / filters run in the Firestore query — still 20 a page
	const { cards, loading, loadingMore, hasMore, error, loadMore } = useWatchHistory(
		mediaType,
		sort,
		filters,
	);
	const shimmer = useSharedShimmer();

	const renderItem = useCallback(
		({ item }: { item: HistoryCard }) =>
			// Title / art not here yet → skeleton until both the row and its show are
			item.ready ? (
				<HistoryCardView
					card={item}
					onPress={() =>
						navigation.navigate(Route.SHOW_DETAIL, { tmdbId: item.tmdbId, mediaType: item.mediaType })
					}
				/>
			) : (
				<HistoryCardSkeleton shimmer={shimmer} />
			),
		[navigation, shimmer],
	);

	if (loading) {
		return (
			<View style={styles.list}>
				{SKELETONS.map((i) => (
					<View key={i} style={i > 0 ? { marginTop: 16 } : undefined}>
						<HistoryCardSkeleton shimmer={shimmer} />
					</View>
				))}
			</View>
		);
	}

	if (cards.length === 0) {
		if (error) return <Text style={styles.empty}>{error}</Text>;
		return <HistoryEmpty mediaType={mediaType} filtered={filters.size > 0} />;
	}

	return (
		<LegendList
			data={cards}
			keyExtractor={(c) => c.id}
			renderItem={renderItem}
			estimatedItemSize={210}
			contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
			ItemSeparatorComponent={() => <View style={styles.separator} />}
			onEndReached={hasMore ? loadMore : undefined}
			onEndReachedThreshold={0.6}
			recycleItems
			ListFooterComponent={
				<View style={styles.footer}>
					{loadingMore && <ActivityIndicator color={colors.primary} />}
				</View>
			}
		/>
	);
}

/** Watch History: TV Shows | Movies, most recently watched first (no tab bar) */
export default function WatchHistoryScreen() {
	const navigation = useNavigation<Nav>();
	const { top, bottom } = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const [tab, setTab] = useState<MediaType>(MediaType.TV);
	// A page's list mounts the first time it's shown (or dragged into view)
	const [visited, setVisited] = useState<Set<MediaType>>(() => new Set([MediaType.TV]));
	// Sort is remembered (cache); filters only last while this page is open
	const [sort, setSort] = useHistorySort();
	const [filters, setFilters] = useState<Set<HistoryFilter>>(() => new Set());
	const [sheetOpen, setSheetOpen] = useState(false);
	const isMovieTab = tab === MediaType.MOVIE;
	const NO_FILTERS = useMemo(() => new Set<HistoryFilter>(), []);
	const tabFilters = (mt: MediaType) => (mt === MediaType.MOVIE ? NO_FILTERS : filters);
	const customised = sort !== HistorySort.LAST_WATCHED || tabFilters(tab).size > 0;
	const toggleFilter = (f: HistoryFilter) =>
		setFilters((prev) => {
			const next = new Set(prev);
			if (next.has(f)) next.delete(f);
			else next.add(f);
			return next;
		});
	const fabBottom = bottom + 20;
	const mountPage = useCallback((key: MediaType) => {
		setVisited((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
	}, []);
	const showPage = useCallback(
		(key: MediaType) => {
			setTab(key);
			mountPage(key);
		},
		[mountPage],
	);
	const goBack = useCallback(() => navigation.goBack(), [navigation]);

	// Swipe pager (Home's pattern): row position in px (0 = TV Shows, width = Movies) follows
	// the finger; on TV Shows a rightward drag is a back swipe instead
	const index = TABS.findIndex((t) => t.key === tab);
	const pos = useSharedValue(index * width);
	const pull = useSharedValue(0);
	const dragging = useSharedValue(false);
	// Where the row is sliding to — the `tab` re-render after a swipe doesn't restart the slide
	const settle = useSharedValue(index * width);
	// translationX at activation — the pan only starts after START_PX, without this the row jumps
	const grab = useSharedValue(0);
	useEffect(() => {
		const to = index * width;
		if (dragging.value || settle.value === to) return;
		settle.value = to;
		pos.value = withTiming(to, { duration: SLIDE_MS });
	}, [index, width, pos, dragging, settle]);

	const goTo = useCallback(
		(key: MediaType) => {
			const i = TABS.findIndex((t) => t.key === key);
			settle.value = i * width;
			pos.value = withTiming(i * width, { duration: SLIDE_MS });
			showPage(key);
		},
		[pos, settle, width, showPage],
	);

	const pan = useMemo(
		() =>
			Gesture.Pan()
				// TV Shows: both ways (left → Movies, right → back); Movies: right → TV Shows
				.activeOffsetX(index === 0 ? [-START_PX, START_PX] : START_PX)
				.failOffsetY([-15, 15])
				.onStart((e) => {
					"worklet";
					dragging.value = true;
					grab.value = e.translationX;
					// Movies slides in under the finger — mount it now if it hasn't been shown
					if (index === 0 && e.translationX < 0) runOnJS(mountPage)(TABS[1].key);
				})
				.onUpdate((e) => {
					"worklet";
					const dx = e.translationX - grab.value;
					if (index === 0 && dx > 0) {
						pos.value = 0;
						pull.value = dx * BACK_PULL;
						return;
					}
					pull.value = 0;
					pos.value = Math.min(width, Math.max(0, index * width - dx));
				})
				.onEnd((e) => {
					"worklet";
					dragging.value = false;
					const dx = e.translationX - grab.value;
					if (index === 0 && dx > 0 && (dx > width * TURN_SHARE || e.velocityX > FLICK_VELOCITY)) {
						runOnJS(goBack)();
						return;
					}
					pull.value = withTiming(0, { duration: SLIDE_MS });
					let next = index;
					if (index === 0 && (dx < -width * TURN_SHARE || e.velocityX < -FLICK_VELOCITY)) next = 1;
					if (index === 1 && (dx > width * TURN_SHARE || e.velocityX > FLICK_VELOCITY)) next = 0;
					settle.value = next * width;
					pos.value = withTiming(next * width, { duration: SLIDE_MS });
					if (next !== index) runOnJS(showPage)(TABS[next].key);
				}),
		[index, width, pos, pull, dragging, settle, grab, mountPage, showPage, goBack],
	);
	const pages = useAnimatedStyle(() => ({ transform: [{ translateX: -pos.value }] }));
	const pulled = useAnimatedStyle(() => ({ transform: [{ translateX: pull.value }] }));

	return (
		<Animated.View style={[styles.container, pulled]}>
			<View style={[styles.topBar, { paddingTop: top + 8 }]}>
				<View style={styles.titleRow}>
					<CircleBackButton tone={CircleButtonTone.SURFACE_LIGHT} onPress={goBack} />
					<Text style={styles.title}>Hall of Shame</Text>
					{/* Mirrors the back button so the title is centred on the bar */}
					<View style={styles.backSpacer} />
				</View>
				<SlidingTabs
					tabs={TABS}
					activeKey={tab}
					onTabPress={(key) => goTo(key as MediaType)}
					style={styles.tabs}
				/>
			</View>
			<View style={styles.listArea}>
				<GestureDetector gesture={pan}>
					<View style={styles.pagerClip}>
						<Animated.View style={[styles.pages, { width: width * TABS.length }, pages]}>
							{TABS.map((t) => (
								<View key={t.key} style={{ width }}>
									{visited.has(t.key) && (
										<HistoryList
											mediaType={t.key}
											sort={sort}
											filters={tabFilters(t.key)}
											bottomInset={fabBottom + SORT_FAB_CLEARANCE}
										/>
									)}
								</View>
							))}
						</Animated.View>
					</View>
				</GestureDetector>
				{/* Sort / filter */}
				<SortFab
					bottom={fabBottom}
					onPress={() => setSheetOpen(true)}
					customised={customised}
					accessibilityLabel="Sort and filter"
				/>
				{/* Cards fade out under the bar instead of being cut off */}
				<LinearGradient
					colors={[colors.background, `${colors.background}00`]}
					style={styles.topFade}
					pointerEvents="none"
				/>
			</View>
			<HistoryViewSheet
				visible={sheetOpen}
				onClose={() => setSheetOpen(false)}
				isMovie={isMovieTab}
				sort={sort}
				onSort={(next) => {
					setSort(next);
					setSheetOpen(false);
				}}
				filters={tabFilters(tab)}
				onToggleFilter={toggleFilter}
				onClearFilters={() => setFilters(new Set())}
			/>
		</Animated.View>
	);
}
