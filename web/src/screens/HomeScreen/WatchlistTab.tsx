import { Fragment, useCallback, useMemo, useState } from "react";
import { Spin } from "antd";
import { useNavigate } from "react-router-dom";
import { useWatchlistScreen } from "@app/screens/HomeScreen/WatchlistTab/useWatchlistScreen";
import { MediaType, WatchStatus } from "@app/enums";
import type { WatchlistListItem } from "@app/types/watchlist";
import ShowCard from "../../components/ShowCard";
import WatchCountSheet from "../../components/WatchCountSheet";
import EpisodeDetailModal from "../../components/EpisodeDetailModal";
import ShowDrawer from "../../components/ShowDrawer";
import ConfirmModal from "../../components/ConfirmModal";
import HomeEmpty, { CAUGHT_UP_ART, WELCOME_ART } from "./HomeEmpty";
import { UP_NEXT_TITLE, withCaughtUp } from "@app/utils/watchlistList";
import { ModalBackdrop, ModalLogo } from "../../components/ModalArt";
import { getCachedCatalogShow, type EnrichedTrackingItem } from "@app/hooks/useWatchlist";
import { colors } from "../../theme/index";
import LoadingScreen from "../../components/LoadingScreen";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { showPath } from "../../routes/paths";
import styles from "./styles/HomeScreen.module.scss";

const UP_NEXT = UP_NEXT_TITLE;

const keyOf = (item: WatchlistListItem) =>
	item.type === "sectionHeader"
		? `section_${item.title}`
		: item.type === "show"
			? `show_${item.item.id}`
			: item.type;

/** Watch List tab — same data/actions as the app via useWatchlistScreen */
export default function WatchlistTab() {
	const navigate = useNavigate();
	const goToShow = useCallback(
		(tmdbId: number, mediaType: MediaType) => navigate(showPath(mediaType, tmdbId)),
		[navigate],
	);
	const w = useWatchlistScreen(goToShow);
	// Episode sheet's logo / name (catalog cache — 0 reads)
	const sheetShow = w.sheetEpisode
		? getCachedCatalogShow(w.sheetEpisode.tmdbShowId, MediaType.TV)
		: null;
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
			withCaughtUp(w.listData, w.listSettled).filter((i) =>
				i.type === "sectionHeader"
					? i.title === UP_NEXT
					: i.type !== "watchedEpisode" && i.type !== "watchedMovie",
			),
		[w.listData, w.listSettled],
	);
	// Caught up: nothing more to page in (scrolling the empty state kept refetching)
	const caughtUp = items.some((i) => i.type === "caughtUp");
	const sentinel = useInfiniteScroll(w.loadMoreTracking, !w.loadingMoreTracking && !caughtUp);

	// Up Next has shows and nothing more is coming: caught-up state as the list's footer
	const caughtUpFooter = w.listSettled && !caughtUp && items.some((i) => i.type === "show");
	const caughtUpView = (
		<HomeEmpty
			art={CAUGHT_UP_ART}
			compact
			plainTitle
			title="Yay!"
			subtitle="You're all caught up."
			tagline="Now don't go getting productive on us. Add some more things to watch."
		/>
	);

	if (w.isLoading) return <LoadingScreen />;
	if (items.length === 0) {
		return (
			<HomeEmpty
				art={WELCOME_ART}
				title="Welcome"
				subtitle="Not tracking a thing yet? Now that's bad television."
				tagline="Your couch is ready, and that free time won't waste itself. You're welcome."
			/>
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
		if (item.type === "caughtUp") return caughtUpView;
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
			{!w.listSettled ? (
				// Skeletons until it's confirmed nothing more is coming, then the image + message
				<div className={`${styles.center} min-h-20!`}>
					<Spin />
				</div>
			) : (
				caughtUpFooter && <div className="py-8">{caughtUpView}</div>
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
				visible={w.sheetVisible}
				title={sheetShow?.title || ""}
				// SEASON / Exx sit in the square beside the logo; the name stays under it
				subtitle={w.sheetEpisode?.episodeTitle}
				episode={
					w.sheetEpisode
						? { season: w.sheetEpisode.season, episode: w.sheetEpisode.episode }
						: undefined
				}
				centered={false}
				tmdbId={w.sheetEpisode?.tmdbShowId}
				mediaType={MediaType.TV}
				logoPath={sheetShow?.logoPath}
				watchCount={w.sheetEpisode?.watchCount || 0}
				onCommit={w.handleEpisodeCountCommit}
				onClose={() => {
					w.setSheetVisible(false);
					w.setSheetEpisode(null);
				}}
			/>
			<WatchCountSheet
				visible={w.movieSheetVisible}
				title={w.sheetMovieTitle || "Movie"}
				centered={false}
				tmdbId={w.sheetMovie?.tmdbId}
				mediaType={MediaType.MOVIE}
				watchCount={w.sheetMovie?.watchCount || 0}
				onCommit={w.handleMovieCountCommit}
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
