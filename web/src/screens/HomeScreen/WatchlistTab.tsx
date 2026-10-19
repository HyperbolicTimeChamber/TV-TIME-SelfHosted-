import { Fragment, useCallback, useMemo, useState } from "react";
import { Button, Spin } from "antd";
import { useNavigate } from "react-router-dom";
import { useWatchlistScreen } from "@app/screens/HomeScreen/WatchlistTab/useWatchlistScreen";
import { MediaType, WatchStatus } from "@app/enums";
import type { WatchlistListItem } from "@app/types/watchlist";
import ShowCard from "../../components/ShowCard";
import WatchActionSheet from "../../components/WatchActionSheet";
import EpisodeDetailModal from "../../components/EpisodeDetailModal";
import ShowDrawer from "../../components/ShowDrawer";
import ConfirmModal from "../../components/ConfirmModal";
import { ModalBackdrop, ModalLogo } from "../../components/ModalArt";
import type { EnrichedTrackingItem } from "@app/hooks/useWatchlist";
import { colors } from "../../theme/index";
import LoadingScreen from "../../components/LoadingScreen";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { Paths, showPath } from "../../routes/paths";
import styles from "./styles/HomeScreen.module.scss";

const UP_NEXT = "What's Up Next";

const keyOf = (item: WatchlistListItem) =>
	item.type === "sectionHeader" ? `section_${item.title}` : item.type === "show" ? `show_${item.item.id}` : item.type;

/** Watch List tab — same data/actions as the app via useWatchlistScreen */
export default function WatchlistTab() {
	const navigate = useNavigate();
	const goToShow = useCallback((tmdbId: number, mediaType: MediaType) => navigate(showPath(mediaType, tmdbId)), [navigate]);
	const w = useWatchlistScreen(goToShow);
	const sentinel = useInfiniteScroll(w.loadMoreTracking, !w.loadingMoreTracking);
	// Long press / right-click on a card → confirm pausing it (no swipe — too easy by accident)
	const [pauseTarget, setPauseTarget] = useState<EnrichedTrackingItem | null>(null);
	const [pausing, setPausing] = useState(false);
	const confirmPause = async () => {
		if (!pauseTarget) return;
		setPausing(true);
		try {
			await w.handleStopWatching(pauseTarget);
			setPauseTarget(null);
		} catch (err) {
			console.error("pause failed:", err);
		} finally {
			setPausing(false);
		}
	};
	// Web shows only the active watchlist — no "Previously Watched" section above it
	const items = useMemo(
		() =>
			w.listData.filter((i) =>
				i.type === "sectionHeader" ? i.title === UP_NEXT : i.type !== "watchedEpisode" && i.type !== "watchedMovie",
			),
		[w.listData],
	);

	if (w.isLoading) return <LoadingScreen />;
	if (items.length === 0) {
		return (
			<div className={styles.center}>
				<p className={styles.empty}>No shows in your watchlist</p>
				<Button type="primary" size="large" onClick={() => navigate(Paths.SEARCH)}>
					+ Add Shows
				</Button>
			</div>
		);
	}

	const render = (item: WatchlistListItem) => {
		if (item.type === "sectionHeader") {
			return (
				<div className={styles.sectionHeader}>
					<span className={styles.sectionPill}>{item.title}</span>
				</div>
			);
		}
		if (item.type !== "show") return null;
		return (
			<ShowCard
				item={item.item as never}
				isUpdating={w.updatingShows.has(item.item.tmdbId)}
				remainingEpisodes={(item.item as { remaining?: number | null }).remaining ?? null}
				onSwipeLeft={w.handleMarkWatched}
				onLongPress={setPauseTarget}
				onPress={w.handleCardPress}
				onTitlePress={w.handleTitlePress}
				onCheckmark={w.handleMarkWatched}
			/>
		);
	};

	return (
		<>
			<div className={styles.list}>
				{/* No wrapper per item: a sticky section header can only stick within its parent */}
				{items.map((item) => (
					<Fragment key={keyOf(item)}>{render(item)}</Fragment>
				))}
			</div>
			<div ref={sentinel} />
			{w.loadingMoreTracking && (
				<div className={`${styles.center} min-h-20!`}>
					<Spin />
				</div>
			)}

			<ConfirmModal
				visible={!!pauseTarget}
				title={pauseTarget?.status === WatchStatus.REWATCHING ? "Pause Rewatch?" : "Pause Show?"}
				imageAtTop={!!pauseTarget?.catalogShow?.backdropPath}
				hideTitle
				image={
					!pauseTarget ? undefined : pauseTarget.catalogShow?.backdropPath ? (
						<ModalBackdrop
							backdropPath={pauseTarget.catalogShow.backdropPath}
							logoPath={pauseTarget.catalogShow.logoPath} tmdbId={pauseTarget.tmdbId} mediaType={pauseTarget.mediaType}
							title={pauseTarget.title}
							paused
						/>
					) : (
						<ModalLogo logoPath={pauseTarget.catalogShow?.logoPath} tmdbId={pauseTarget.tmdbId} mediaType={pauseTarget.mediaType} title={pauseTarget.title} paused />
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
				visible={w.sheetVisible}
				label={w.sheetLabel}
				watchCount={w.sheetEpisode?.watchCount || 0}
				onSelect={w.handleSheetAction}
				onClose={() => {
					w.setSheetVisible(false);
					w.setSheetEpisode(null);
				}}
			/>
			<WatchActionSheet
				visible={w.movieSheetVisible}
				label={w.sheetMovieTitle || "Movie"}
				watchCount={w.sheetMovie?.watchCount || 0}
				onSelect={w.handleMovieSheetAction}
				onClose={() => {
					w.setMovieSheetVisible(false);
					w.setSheetMovie(null);
				}}
			/>
			{w.epModalData && (
				<EpisodeDetailModal
					visible={w.epModalVisible}
					tmdbId={w.epModalData.tmdbId}
					showTitle={w.epModalData.showTitle}
					showPosterPath={w.epModalData.showPosterPath}
					showBackdropPath={w.epModalData.showBackdropPath}
					episodes={w.epModalData.episodes}
					initialIndex={w.epModalData.initialIndex}
					watchedKeys={w.epModalData.watchedKeys}
					currentNextEpisode={w.epModalData.currentNextEpisode}
					rewatchCount={w.epModalData.rewatchCount}
					onMarkWatched={w.handleCarouselMarkWatched}
					onMarkWatchedThrough={w.handleMarkWatchedThrough}
					onUnmarkWatched={w.handleUnmarkEpisode}
					onSkipEpisode={w.epModalData.isRewatching ? w.handleModalSkip : undefined}
					onShowPress={w.handleEpModalShowPress}
					onClose={() => {
						w.setEpModalVisible(false);
						w.setEpModalData(null);
					}}
					onLoadEpisodeDetails={w.handleLoadEpisodeDetails}
				/>
			)}
			<ShowDrawer
				visible={w.drawerVisible}
				show={w.drawerShow}
				onGoToShow={
					w.drawerShow?.tmdbId
						? () => {
								const id = w.drawerShow!.tmdbId!;
								const mt = w.drawerShow!.mediaType === "movie" ? MediaType.MOVIE : MediaType.TV;
								w.setDrawerVisible(false);
								w.setDrawerShow(null);
								goToShow(id, mt);
							}
						: undefined
				}
				onClose={() => {
					w.setDrawerVisible(false);
					w.setDrawerShow(null);
				}}
			/>
		</>
	);
}
