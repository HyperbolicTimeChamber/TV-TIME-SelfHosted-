import { useCallback, useRef, useEffect, useMemo, useState } from "react";
import { View, Animated, StyleSheet, RefreshControl, Dimensions } from "react-native";
import { LegendList } from "@legendapp/list/react-native";
import { useNavigation, CompositeNavigationProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
	ConfirmModal,
	LoadingSpinner,
	ShowCard,
	WatchActionSheet,
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
import type { EnrichedTrackingItem } from "../../../hooks/useWatchlist";
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
		handleSheetAction,
		handleMovieCheckmark,
		handleMovieSwipeLeft,
		handleMovieSwipeRight,
		handleMovieSheetAction,
		handleTvPress,
		sheetLabel,
		listData: liveListData,
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
	} = useWatchlistScreen(handleNavigateToShow);
	const listData = useMemo(
		() => withCaughtUp(liveListData, listSettled),
		[liveListData, listSettled],
	);

	const caughtUp = listData.some((i) => i.type === "caughtUp");
	// Up Next has shows and nothing more is coming: caught-up state as the list's footer
	const caughtUpFooter = listSettled && !caughtUp && listData.some((i) => i.type === "show");
	const [listH, setListH] = useState(0);
	const listRef = useRef<any>(null);
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
						onPress={handleTvPress}
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
			);
		},
		[
			handleMarkWatched,
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
			<LegendList
				ref={listRef}
				data={listData}
				initialScrollIndex={initialUpNext.current ?? 0}
				keyExtractor={(item) => {
					if (item.type === "sectionHeader") return `section_${item.title}`;
					if (item.type === "watchedMovie") return `movie_${item.movie.id}`;
					if (item.type === "watchedEpisode") return `watched_${item.episode.id}`;
					if (item.type === "caughtUp") return "caughtUp";
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
				// Caught up: nothing more to page in (scrolling the empty state kept refetching)
				onEndReached={caughtUp ? undefined : () => loadMoreTracking()}
				onEndReachedThreshold={1.5}
				ListFooterComponent={
					loadingMoreTracking ? (
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
