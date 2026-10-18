import { useCallback, useRef, useEffect, useMemo, useState } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	Animated,
	StyleSheet,
	RefreshControl,
	Dimensions,
} from "react-native";
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

const SCREEN_HEIGHT = Dimensions.get("window").height;

type NavProp = CompositeNavigationProp<
	NativeStackNavigationProp<HomeStackParamList, Route.HOME_TABS>,
	NativeStackNavigationProp<MainStackParamList>
>;

const SeparatorComponent = () => <View style={styles.separator} />;

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
		listData,
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

	const listRef = useRef<any>(null);
	// Up-next card long-pressed → confirm pausing it
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
	// initialScrollIndex positions the list as it mounts — a timed scrollToIndex after
	// mount raced the first layout and left the list at the top.
	const upNextIndex = useMemo(
		() => listData.findIndex((i) => i.type === "sectionHeader" && i.title === "What's Up Next"),
		[listData],
	);
	const initialUpNext = useRef<number | null>(null);
	if (initialUpNext.current === null && !isLoading && listData.length > 0) {
		initialUpNext.current = Math.max(0, upNextIndex);
	}
	const scrollToUpNext = useCallback(() => {
		if (upNextIndex > 0) {
			listRef.current?.scrollToIndex({ index: upNextIndex, animated: true, viewOffset: 0 });
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
		],
	);

	const contentStyle = useMemo(
		() => [styles.listContent, { minHeight: SCREEN_HEIGHT + prevWatchedOffset }],
		[prevWatchedOffset],
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
				ListFooterComponent={loadingMoreTracking ? <SkeletonFooter /> : null}
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
			<ConfirmModal
				visible={!!pauseTarget}
				title={pauseTarget?.status === WatchStatus.REWATCHING ? "Pause Rewatch?" : "Pause Show?"}
				image={
					!pauseTarget ? undefined : pauseTarget.catalogShow?.backdropPath ? (
						<ModalBackdrop
							backdropPath={pauseTarget.catalogShow.backdropPath}
							logoPath={pauseTarget.catalogShow.logoPath}
							tmdbId={pauseTarget.tmdbId}
							mediaType={pauseTarget.mediaType}
							title={pauseTarget.title}
							paused
						/>
					) : (
						<ModalLogo
							logoPath={pauseTarget.catalogShow?.logoPath}
							tmdbId={pauseTarget.tmdbId}
							mediaType={pauseTarget.mediaType}
							title={pauseTarget.title}
							paused
						/>
					)
				}
				hint="It leaves your watchlist. Resume any time from its page."
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
