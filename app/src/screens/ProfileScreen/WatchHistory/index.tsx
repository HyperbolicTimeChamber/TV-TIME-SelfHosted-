import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LegendList } from "@legendapp/list/react-native";
import { LinearGradient } from "expo-linear-gradient";
import PagerView from "react-native-pager-view";
import SlidingTabs from "../../../components/SlidingTabs";
import { CircleBackButton } from "../../../components/CircleButton";
import { useSharedShimmer } from "../../../components/SkeletonLine";
import { useWatchHistory } from "../../../hooks";
import { useHistorySort } from "../../../hooks/useWatchHistory";
import { CircleButtonTone, HistoryFilter, HistorySort, MediaType, Route } from "../../../enums";
import type { ProfileStackParamList } from "../../../types";
import type { HistoryCard } from "../../../utils";
import { Ionicons } from "@expo/vector-icons";
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
		({ item }: { item: HistoryCard }) => (
			<HistoryCardView
				card={item}
				onPress={() =>
					navigation.navigate(Route.SHOW_DETAIL, { tmdbId: item.tmdbId, mediaType: item.mediaType })
				}
			/>
		),
		[navigation],
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
	const [tab, setTab] = useState<MediaType>(MediaType.TV);
	// Swipe between TV Shows / Movies; a page's list mounts the first time it's shown
	const pagerRef = useRef<PagerView>(null);
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
	const showPage = useCallback((key: MediaType) => {
		setTab(key);
		setVisited((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
	}, []);

	return (
		<View style={styles.container}>
			<View style={[styles.topBar, { paddingTop: top + 8 }]}>
				<View style={styles.titleRow}>
					<CircleBackButton
						tone={CircleButtonTone.SURFACE_LIGHT}
						onPress={() => navigation.goBack()}
					/>
					<Text style={styles.title}>Hall of Shame</Text>
					{/* Mirrors the back button so the title is centred on the bar */}
					<View style={styles.backSpacer} />
				</View>
				<SlidingTabs
					tabs={TABS}
					activeKey={tab}
					onTabPress={(key) => {
						showPage(key as MediaType);
						pagerRef.current?.setPage(TABS.findIndex((t) => t.key === key));
					}}
					style={styles.tabs}
				/>
			</View>
			<View style={styles.listArea}>
				<PagerView
					ref={pagerRef}
					style={styles.pager}
					initialPage={0}
					onPageSelected={(e) => showPage(TABS[e.nativeEvent.position].key)}
				>
					{TABS.map((t) => (
						<View key={t.key} style={styles.pager}>
							{visited.has(t.key) && (
								<HistoryList
									mediaType={t.key}
									sort={sort}
									filters={tabFilters(t.key)}
									bottomInset={fabBottom + 72}
								/>
							)}
						</View>
					))}
				</PagerView>
				{/* Sort / filter */}
				<TouchableOpacity
					style={[styles.fab, { bottom: fabBottom }]}
					onPress={() => setSheetOpen(true)}
					accessibilityLabel="Sort and filter"
				>
					<Ionicons name="options-outline" size={24} color={colors.text} />
					{customised && <View style={styles.fabDot} />}
				</TouchableOpacity>
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
		</View>
	);
}
