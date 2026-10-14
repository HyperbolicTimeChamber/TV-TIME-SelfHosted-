import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Spin } from "antd";
import { useNavigate } from "react-router-dom";
import { useWatchlistScreen } from "@app/screens/HomeScreen/WatchlistTab/useWatchlistScreen";
import { MediaType } from "@app/enums";
import type { WatchlistListItem } from "@app/types/watchlist";
import ShowCard from "../../components/ShowCard";
import WatchActionSheet from "../../components/WatchActionSheet";
import EpisodeDetailModal from "../../components/EpisodeDetailModal";
import ShowDrawer from "../../components/ShowDrawer";
import LoadingScreen from "../../components/LoadingScreen";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { Paths, showPath } from "../../routes/paths";
import WatchedEpisodeRow from "./WatchedEpisodeRow";
import styles from "./styles/HomeScreen.module.scss";

const UP_NEXT = "What's Up Next";

const keyOf = (item: WatchlistListItem) =>
	item.type === "sectionHeader"
		? `section_${item.title}`
		: item.type === "watchedMovie"
			? `movie_${item.movie.id}`
			: item.type === "watchedEpisode"
				? `watched_${item.episode.id}`
				: `show_${item.item.id}`;

/** Watch List tab — same data/actions as the app via useWatchlistScreen */
export default function WatchlistTab() {
	const navigate = useNavigate();
	const goToShow = useCallback((tmdbId: number, mediaType: MediaType) => navigate(showPath(mediaType, tmdbId)), [navigate]);
	const w = useWatchlistScreen(goToShow);
	const upNextRef = useRef<HTMLDivElement>(null);
	const scrolled = useRef(false);
	// True once the page has jumped to "What's Up Next" — gates auto-loading older items
	const [settled, setSettled] = useState(false);

	// Open on "What's Up Next" (previously watched sits above, like the app)
	useEffect(() => {
		if (scrolled.current || w.isLoading || w.prevWatchedOffset <= 0) return;
		scrolled.current = true;
		requestAnimationFrame(() => {
			upNextRef.current?.scrollIntoView({ block: "start" });
			setSettled(true);
		});
	}, [w.isLoading, w.prevWatchedOffset]);

	const sentinel = useInfiniteScroll(w.loadMoreTracking, !w.loadingMoreTracking);

	// Scrolling up near the top loads older "Previously Watched" (app: pull to refresh).
	// Only after the initial jump to "What's Up Next", or it would fire on open.
	const listRef = useRef<HTMLDivElement>(null);
	const anchor = useRef<{ el: Element; top: number } | null>(null);
	const loadEarlier = useCallback(() => {
		const el = listRef.current?.firstElementChild;
		if (el) anchor.current = { el, top: el.getBoundingClientRect().top };
		w.loadMorePrevWatched();
	}, [w]);
	const topSentinel = useInfiniteScroll(
		loadEarlier,
		settled && w.hasMorePrevWatched && !w.loadingMorePrevWatched,
	);
	// Older items render above: shift the scroll so what you were looking at stays put
	useLayoutEffect(() => {
		const a = anchor.current;
		if (!a || w.loadingMorePrevWatched) return;
		anchor.current = null;
		if (a.el.isConnected) window.scrollBy(0, a.el.getBoundingClientRect().top - a.top);
	}, [w.listData, w.loadingMorePrevWatched]);

	if (w.isLoading) return <LoadingScreen />;
	if (w.listData.length === 0) {
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
				<div className={styles.sectionHeader} ref={item.title === UP_NEXT ? upNextRef : undefined}>
					<span className={styles.sectionPill}>{item.title}</span>
				</div>
			);
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
						} as never
					}
					isWatched
					watchCount={item.movie.watchCount ?? 0}
					onSwipeLeft={() => w.handleMovieSwipeLeft(item.movie)}
					onSwipeRight={() => w.handleMovieSwipeRight(item.movie)}
					onPress={(id) => goToShow(id, MediaType.MOVIE)}
					onCheckmark={async () => w.handleMovieCheckmark(item.movie, item.show.title)}
				/>
			);
		}
		if (item.type === "watchedEpisode") {
			return (
				<WatchedEpisodeRow
					episode={item.episode}
					show={item.show}
					onPress={w.handleTvPress}
					onCheckmarkPress={w.handleWatchedCheckmark}
					onSwipeLeft={w.handleWatchedSwipeLeft}
					onSwipeRight={w.handleWatchedSwipeRight}
				/>
			);
		}
		return (
			<ShowCard
				item={item.item as never}
				isUpdating={w.updatingShows.has(item.item.tmdbId)}
				remainingEpisodes={(item.item as { remaining?: number | null }).remaining ?? null}
				onSwipeLeft={w.handleMarkWatched}
				onSwipeRight={w.handleStopWatching}
				onPress={w.handleCardPress}
				onTitlePress={w.handleTitlePress}
				onCheckmark={w.handleMarkWatched}
			/>
		);
	};

	return (
		<>
			{/* App: pull-to-refresh loads older history; web: auto-loads near the top */}
			{w.hasMorePrevWatched && (
				<div ref={topSentinel} className={styles.loadEarlier}>
					{w.loadingMorePrevWatched && <Spin size="small" />}
				</div>
			)}
			<div className={styles.list} ref={listRef}>
				{/* No wrapper per item: a sticky section header can only stick within its
				    parent, and a header-sized wrapper made it scroll straight away */}
				{w.listData.map((item) => (
					<Fragment key={keyOf(item)}>{render(item)}</Fragment>
				))}
			</div>
			<div ref={sentinel} />
			{w.loadingMoreTracking && (
				<div className={`${styles.center} min-h-20!`}>
					<Spin />
				</div>
			)}
			{/* Keep "What's Up Next" scrollable to the top even with few cards */}
			<div className="min-h-[70dvh]" />

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
