import {
	useCallback,
	useRef,
	useEffect,
	useLayoutEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import { View, Animated, StyleSheet, RefreshControl, Dimensions } from "react-native";
import type { LegendListRef } from "@legendapp/list/react-native";
import { AnimatedLegendList } from "@legendapp/list/reanimated";
import Reanimated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { useFocusEffect, useNavigation, CompositeNavigationProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
	ConfirmModal,
	LoadingSpinner,
	ShowCard,
	WatchCountSheet,
	EpisodeDetailModal,
	ShowDrawer,
} from "../../../components";
import { colors, spacing } from "../../../theme";
import {
	HomeStackParamList,
	MainStackParamList,
	MediaType,
	Route,
	WatchStatus,
} from "../../../types";
import { useSharedShimmer } from "../../../components/SkeletonLine";
import { ModalBackdrop, ModalLogo } from "../../../components/modals/ModalArt";
import type { WatchlistListItem } from "../../../types/watchlist";
import { getCachedCatalogShow, type EnrichedTrackingItem } from "../../../hooks/useWatchlist";
import { styles } from "./styles";
import { useWatchlistScreen } from "./useWatchlistScreen";
import WatchedEpisodeRow from "./WatchedEpisodeRow";
import SectionHeader from "./SectionHeader";
import HomeEmpty, { CAUGHT_UP_ART, WELCOME_ART } from "../HomeEmpty";
import { withCaughtUp } from "../../../utils";

const SCREEN_HEIGHT = Dimensions.get("window").height;
/** Height of a pinned section header pill row */
const SECTION_HEADER_H = 48;

type NavProp = CompositeNavigationProp<
	NativeStackNavigationProp<HomeStackParamList, Route.HOME_TABS>,
	NativeStackNavigationProp<MainStackParamList>
>;

const SeparatorComponent = () => <View style={styles.separator} />;

/** Previously watched rows only offer pause while their title is still being (re)watched */
const canPause = (show: EnrichedTrackingItem) =>
	show.status === WatchStatus.WATCHING || show.status === WatchStatus.REWATCHING;

const POSTER_WIDTH = 100;

function SkeletonFooter() {
	const shimmer = useSharedShimmer();
	return (
		<View style={skeletonStyles.container}>
			{[0, 1, 2].map((i) => (
				<Animated.View key={i} style={[skeletonStyles.card, { opacity: shimmer }]} />
			))}
		</View>
	);
}

const skeletonStyles = StyleSheet.create({
	container: {
		gap: spacing.sm,
		paddingTop: spacing.sm,
		paddingHorizontal: spacing.sm,
	},
	card: {
		minHeight: POSTER_WIDTH,
		borderRadius: 8,
		backgroundColor: colors.border,
	},
});

/** On-screen movement → ease-in-out; quick enough to read as a response to the tap */
const CARD_MOVE_MS = 300;
const CARD_MOVE_EASING = Easing.bezier(0.77, 0, 0.175, 1);
/** How long the moved cards keep their glide offsets in the list data */
const CARD_MOVE_WINDOW_MS = CARD_MOVE_MS + 200;

/** A card's glide after a mark reorders the list: drawn `offset` px from where the list placed
 *  it, easing to 0. `token` starts each glide once */
type CardFlip = { offset: number; token: number };
type ListRow = WatchlistListItem & { flip?: CardFlip };

/** A card counts as seen once half of it is on screen */
const CARD_VIEWABILITY = { itemVisiblePercentThreshold: 50 };

const keyOf = (item: WatchlistListItem) => {
	if (item.type === "sectionHeader") return `section_${item.title}`;
	if (item.type === "watchedMovie") return `movie_${item.movie.id}`;
	if (item.type === "watchedEpisode") return `watched_${item.episode.id}`;
	if (item.type === "caughtUp") return "caughtUp";
	return `show_${item.item.id}`;
};

/**
 * Where each card moved by a reorder was drawn before it, relative to where the list will put
 * it (FLIP). Read from the list's current layout — the old order — and laid out again in the new
 * order from the first card's slot, with the cards' measured sizes
 */
function flipOffsets(
	list: LegendListRef | null,
	prev: readonly WatchlistListItem[],
	next: readonly WatchlistListItem[],
): Map<string, number> {
	const offsets = new Map<string, number>();
	const state = list?.getState();
	if (!state) return offsets;
	const prevShows = prev.filter((i) => i.type === "show").map(keyOf);
	if (prevShows.length === 0) return offsets;
	const known = new Set(prevShows);
	const nextShows = next.filter((i) => i.type === "show").map(keyOf);
	let top = state.positionByKey(prevShows[0]);
	if (top === undefined) return offsets;
	for (const key of nextShows) {
		const from = state.positionByKey(key);
		const index = prev.findIndex((i) => keyOf(i) === key);
		// New card or one the list never laid out: nothing to glide from — and the rest can't be
		// placed reliably
		if (!known.has(key) || from === undefined || index === -1) break;
		if (from !== top) offsets.set(key, from - top);
		top += state.sizeAtIndex(index);
	}
	return offsets;
}

const UP_NEXT_KEY = keyOf({ type: "sectionHeader", title: "What's Up Next" });

const isWatchedRow = (item: WatchlistListItem) =>
	item.type === "watchedEpisode" || item.type === "watchedMovie";

/** Scrolled to (or past) the "What's Up Next" header — Previously Watched is off screen above */
function upNextOnScreen(list: LegendListRef | null): boolean {
	const state = list?.getState();
	const top = state?.positionByKey(UP_NEXT_KEY);
	return !!state && top !== undefined && state.scroll >= top - 1;
}

/** The list without the held rows; a section they leave empty goes too */
function withoutHeld(data: WatchlistListItem[], held: ReadonlySet<string>): WatchlistListItem[] {
	if (held.size === 0) return data;
	const kept = data.filter((i) => !held.has(keyOf(i)));
	return kept.filter(
		(i, n) => i.type !== "sectionHeader" || (kept[n + 1] && kept[n + 1].type !== "sectionHeader"),
	);
}

/** Draws a card at its glide offset and eases it home — a transform only, so the list's own
 *  positions (and its corrections when a size changes) are never animated */
function FlipView({ flip, children }: Readonly<{ flip?: CardFlip; children: ReactNode }>) {
	const y = useSharedValue(0);
	const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
	const token = flip?.token;
	const offset = flip?.offset ?? 0;
	useLayoutEffect(() => {
		if (token === undefined || offset === 0) return;
		y.value = withSequence(
			withTiming(offset, { duration: 0 }),
			withTiming(0, { duration: CARD_MOVE_MS, easing: CARD_MOVE_EASING }),
		);
	}, [token, offset, y]);
	return <Reanimated.View style={style}>{children}</Reanimated.View>;
}

export default function WatchlistTab() {
	const navigation = useNavigation<NavProp>();

	const handleNavigateToShow = useCallback(
		(tmdbId: number, mediaType: MediaType) => {
			navigation.navigate(Route.SHOW_DETAIL, { tmdbId, mediaType });
		},
		[navigation],
	);

	const {
		isLoading,
		onCardsVisible,
		sheetVisible,
		setSheetVisible,
		sheetEpisode,
		setSheetEpisode,
		movieSheetVisible,
		setMovieSheetVisible,
		sheetMovie,
		setSheetMovie,
		sheetMovieTitle,
		epModalVisible,
		setEpModalVisible,
		epModalData,
		setEpModalData,
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
		sheetInRewatch,
		sheetMinCount,
		handleMovieCheckmark,
		handleMovieSwipeLeft,
		handleMovieSwipeRight,
		handleMovieCountCommit,
		handleWatchedRowPress,
		listData: liveListData,
		promotions,
		listSettled,
		loadMoreTracking,
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
	} = useWatchlistScreen(handleNavigateToShow);
	// Episode sheet's logo / name (catalog cache — 0 reads)
	const sheetShow = sheetEpisode
		? getCachedCatalogShow(sheetEpisode.tmdbShowId, MediaType.TV)
		: null;
	const fullData = useMemo(
		() => withCaughtUp(liveListData, listSettled),
		[liveListData, listSettled],
	);
	const listRef = useRef<LegendListRef | null>(null);

	// A row joining Previously Watched (a mark saving) lands just above Up Next. Inserted there
	// while Up Next is on screen, the list keeps the view in place a frame or two late on
	// Android — the cards nudge. So it waits, hidden, until the next drag or leaving the tab
	const seenWatched = useRef<Set<string> | null>(null);
	const [held, setHeld] = useState<ReadonlySet<string>>(new Set());
	const watchedKeys = fullData.filter(isWatchedRow).map(keyOf);
	if (seenWatched.current === null) {
		if (fullData.length > 0) seenWatched.current = new Set(watchedKeys);
	} else {
		const seen = seenWatched.current;
		const fresh = watchedKeys.filter((k) => !seen.has(k));
		if (fresh.length > 0) {
			for (const k of fresh) seen.add(k);
			if (upNextOnScreen(listRef.current)) setHeld((prev) => new Set([...prev, ...fresh]));
		}
	}
	const releaseHeld = useCallback(() => {
		setHeld((prev) => (prev.size === 0 ? prev : new Set()));
	}, []);
	useFocusEffect(useCallback(() => releaseHeld, [releaseHeld]));
	const listData = useMemo(() => withoutHeld(fullData, held), [fullData, held]);

	// The rows as last drawn: a reorder's glide starts from their layout
	const drawnRows = useRef<readonly WatchlistListItem[]>(listData);
	useEffect(() => {
		drawnRows.current = listData;
	}, [listData]);
	// A mark lifting a card: each moved card glides from where it was drawn. Read during render —
	// the list still holds the old layout until this render commits
	const [seenPromotions, setSeenPromotions] = useState(promotions);
	const [flips, setFlips] = useState<{ token: number; offsets: Map<string, number> } | null>(null);
	if (seenPromotions !== promotions) {
		setSeenPromotions(promotions);
		setFlips({
			token: promotions,
			offsets: flipOffsets(listRef.current, drawnRows.current, listData),
		});
	}
	useEffect(() => {
		if (!flips) return;
		const t = setTimeout(() => setFlips(null), CARD_MOVE_WINDOW_MS);
		return () => clearTimeout(t);
	}, [flips]);
	// LegendList re-renders rows only when their data changes, so the glide rides in the rows
	const onViewableItemsChanged = useCallback(
		({ viewableItems }: { viewableItems: Array<{ item: ListRow }> }) =>
			onCardsVisible(
				viewableItems.flatMap(({ item }) => (item.type === "show" ? [item.item.tmdbId] : [])),
			),
		[onCardsVisible],
	);
	const rows = useMemo<ListRow[]>(() => {
		if (!flips || flips.offsets.size === 0) return listData;
		return listData.map((i) => {
			const offset = flips.offsets.get(keyOf(i));
			return offset === undefined ? i : { ...i, flip: { offset, token: flips.token } };
		});
	}, [listData, flips]);

	const caughtUp = listData.some((i) => i.type === "caughtUp");
	// Up Next has shows and nothing more is coming: caught-up state as the list's footer
	const caughtUpFooter = listSettled && !caughtUp && listData.some((i) => i.type === "show");
	const [listH, setListH] = useState(0);
	// Up-next / previously watched card long-pressed → confirm pausing it
	const [pauseTarget, setPauseTarget] = useState<EnrichedTrackingItem | null>(null);
	const [pausing, setPausing] = useState(false);
	const confirmPause = useCallback(async () => {
		if (!pauseTarget) return;
		setPausing(true);
		try {
			await handleStopWatching(pauseTarget);
			setPauseTarget(null);
		} catch (err) {
			console.error("pause failed:", err);
		} finally {
			setPausing(false);
		}
	}, [pauseTarget, handleStopWatching]);

	// Open at "What's Up Next" (previously watched sits above it, reached by scrolling up).
	// initialScrollIndex positions the list as it mounts (a timed scrollToIndex races the first layout).
	const upNextIndex = useMemo(
		() => listData.findIndex((i) => i.type === "sectionHeader" && i.title === "What's Up Next"),
		[listData],
	);
	const initialUpNext = useRef<number | null>(null);
	if (initialUpNext.current === null && !isLoading && listData.length > 0) {
		initialUpNext.current = Math.max(0, upNextIndex);
	}
	// A jump, not an animated scroll: on Android an animated scroll cut short (e.g. by a tab swipe)
	// can leave the ScrollView thinking it's still scrolling, and it then swallows every tap on the
	// list until it's scrolled again (cards stopped opening their info modal)
	const scrollToUpNext = useCallback(() => {
		if (upNextIndex > 0) {
			listRef.current?.scrollToIndex({ index: upNextIndex, animated: false, viewOffset: 0 });
		}
	}, [upNextIndex]);

	// Re-scroll on every tab focus
	useEffect(() => {
		const parent = navigation.getParent();
		if (!parent) return;
		const unsub = parent.addListener("focus", () => {
			if (prevWatchedOffset > 0) {
				setTimeout(scrollToUpNext, 100);
			}
		});
		return unsub;
	}, [navigation, prevWatchedOffset, scrollToUpNext]);

	const renderCaughtUp = useCallback(
		(minHeight?: number) => (
			<HomeEmpty
				art={CAUGHT_UP_ART}
				compact
				plainTitle
				minHeight={minHeight}
				title="Yay!"
				subtitle="You're all caught up."
				tagline="Now don't go getting productive on us. Add some more things to watch."
				onAddShows={() => navigation.navigate(Route.SWIPE_TABS, { screen: Route.SEARCH })}
			/>
		),
		[navigation],
	);

	const renderItem = useCallback(
		({ item }: { item: ListRow }) => {
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
						onLongPress={canPause(item.show) ? () => setPauseTarget(item.show) : undefined}
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
						onPress={handleWatchedRowPress}
						onCheckmarkPress={handleWatchedCheckmark}
						onSwipeLeft={handleWatchedSwipeLeft}
						onSwipeRight={handleWatchedSwipeRight}
						onLongPress={canPause(item.show) ? setPauseTarget : undefined}
					/>
				);
			}

			if (item.type === "caughtUp") {
				// Fills the list under the pinned "What's Up Next" header, so it can't scroll off
				return renderCaughtUp(Math.max(0, listH - SECTION_HEADER_H));
			}

			// All fields pre-computed in useWatchlistData — no catalog lookup needed
			return (
				<FlipView flip={item.flip}>
					<ShowCard
						item={item.item}
						isUpdating={updatingShows.has(item.item.tmdbId)}
						remainingEpisodes={(item.item as any).remaining ?? null}
						onSwipeLeft={handleMarkWatched}
						// Pausing is a long press + confirm (no swipe — too easy to trigger by accident)
						onLongPress={setPauseTarget}
						onPress={handleCardPress}
						onTitlePress={handleTitlePress}
						onCheckmark={handleMarkWatched}
					/>
				</FlipView>
			);
		},
		[
			handleMarkWatched,
			handleCardPress,
			handleTitlePress,
			handleWatchedRowPress,
			watchedCountByShow,
			updatingShows,
			handleWatchedCheckmark,
			handleWatchedSwipeLeft,
			handleWatchedSwipeRight,
			handleMovieCheckmark,
			handleMovieSwipeLeft,
			handleMovieSwipeRight,
			renderCaughtUp,
			listH,
		],
	);

	// Room to scroll "What's Up Next" to the top. Caught up: exactly the list's own height, so the
	// pinned header + empty state stop there instead of scrolling on into blank space
	const contentStyle = useMemo(
		() => [
			styles.listContent,
			{ minHeight: (caughtUp && listH > 0 ? listH : SCREEN_HEIGHT) + prevWatchedOffset },
		],
		[prevWatchedOffset, caughtUp, listH],
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
			<HomeEmpty
				art={WELCOME_ART}
				title="Welcome"
				subtitle="Not tracking a thing yet? Now that's bad television."
				tagline="Your couch is ready, and that free time won't waste itself. You're welcome."
				onAddShows={() => navigation.navigate(Route.SWIPE_TABS, { screen: Route.SEARCH })}
			/>
		);
	}

	return (
		<>
			{/* Reanimated variant for its sticky headers: the plain list's don't pin on the new
			    architecture. No itemLayoutAnimation — card moves are FlipView's */}
			<AnimatedLegendList
				ref={listRef}
				data={rows}
				initialScrollIndex={initialUpNext.current ?? 0}
				keyExtractor={keyOf}
				renderItem={renderItem}
				recycleItems
				drawDistance={SCREEN_HEIGHT * 2}
				estimatedItemSize={110}
				stickyHeaderIndices={stickyIndices}
				onScrollBeginDrag={releaseHeld}
				// Heals (missing poster / episode name…) run only for cards kept on screen
				onViewableItemsChanged={onViewableItemsChanged}
				viewabilityConfig={CARD_VIEWABILITY}
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
				// Caught up: nothing more to page in (scrolling the empty state kept refetching)
				onEndReached={caughtUp ? undefined : () => loadMoreTracking()}
				onEndReachedThreshold={1.5}
				ListFooterComponent={
					// Skeletons until it's confirmed nothing more is coming, then the image + message
					!listSettled ? (
						<SkeletonFooter />
					) : caughtUpFooter ? (
						<View style={styles.caughtUpFooter}>{renderCaughtUp()}</View>
					) : null
				}
				ItemSeparatorComponent={SeparatorComponent}
				maintainVisibleContentPosition={{ data: true, size: true }}
				style={styles.list}
				onLayout={(e) => setListH(e.nativeEvent.layout.height)}
				contentContainerStyle={contentStyle}
			/>
			<WatchCountSheet
				visible={sheetVisible}
				title={sheetShow?.title || ""}
				// SEASON / Exx sit in the square beside the logo; the name stays under it
				subtitle={sheetEpisode?.episodeTitle}
				episode={
					sheetEpisode ? { season: sheetEpisode.season, episode: sheetEpisode.episode } : undefined
				}
				centered={false}
				tmdbId={sheetEpisode?.tmdbShowId}
				mediaType={MediaType.TV}
				logoPath={sheetShow?.logoPath}
				watchCount={sheetEpisode?.watchCount || 0}
				allowWatchedOnce={!sheetInRewatch}
				minCount={sheetMinCount}
				onCommit={handleEpisodeCountCommit}
				onClose={() => {
					setSheetVisible(false);
					setSheetEpisode(null);
				}}
			/>
			<ConfirmModal
				visible={!!pauseTarget}
				title={pauseTarget?.status === WatchStatus.REWATCHING ? "Pause Rewatch?" : "Pause Show?"}
				imageAtTop={!!pauseTarget?.catalogShow?.backdropPath}
				hideTitle
				image={
					!pauseTarget ? undefined : pauseTarget.catalogShow?.backdropPath ? (
						<ModalBackdrop
							backdropPath={pauseTarget.catalogShow.backdropPath}
							logoPath={pauseTarget.catalogShow.logoPath}
							tmdbId={pauseTarget.tmdbId}
							mediaType={pauseTarget.mediaType}
							title={pauseTarget.title}
							paused
							nameDelay={2000}
						/>
					) : (
						<ModalLogo
							logoPath={pauseTarget.catalogShow?.logoPath}
							tmdbId={pauseTarget.tmdbId}
							mediaType={pauseTarget.mediaType}
							title={pauseTarget.title}
							paused
							nameDelay={2000}
						/>
					)
				}
				hint={
					pauseTarget?.status === WatchStatus.REWATCHING
						? "Pausing this rewatch will take it off your watchlist. You can resume it any time from its page."
						: "Pausing this show will take it off your watchlist. You can resume it any time from its page."
				}
				confirmLabel="Pause"
				confirmColor={colors.stopBlue}
				loading={pausing}
				onConfirm={confirmPause}
				onClose={() => setPauseTarget(null)}
			/>
			<WatchCountSheet
				visible={movieSheetVisible}
				title={sheetMovieTitle || "Movie"}
				// No episode square → logo alone, centred (as on the info page)
				tmdbId={sheetMovie?.tmdbId}
				mediaType={MediaType.MOVIE}
				watchCount={sheetMovie?.watchCount || 0}
				onCommit={handleMovieCountCommit}
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
					rewatchCount={epModalData.rewatchCount}
					onMarkWatched={handleCarouselMarkWatched}
					onMarkWatchedThrough={handleMarkWatchedThrough}
					onUnmarkWatched={handleUnmarkEpisode}
					onSkipEpisode={epModalData.isRewatching ? handleModalSkip : undefined}
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
