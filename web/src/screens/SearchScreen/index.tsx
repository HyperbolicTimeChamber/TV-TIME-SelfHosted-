import { IoIosCloseCircle } from "react-icons/io";
import { useCallback, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Button } from "antd";
import { IoChevronBackCircleOutline, IoGrid, IoList, IoSearch } from "react-icons/io5";
import { useNavigate, useSearchParams } from "react-router-dom";
import { encodeText } from "@app/utils/subjectLink";
import { SEARCH_MAX_QUERY_LENGTH } from "@app/enums";
import { useSearch } from "@app/hooks/useSearch";
import { useTrending } from "@app/hooks/useTrending";
import { useCustomLists } from "@app/hooks/useCustomLists";
import { useCustomListView } from "@app/hooks/useCustomListView";
import { entryFromSearchResult, listedTitleKeys, listItemKey } from "@app/utils/customLists";
import { useSearchActions } from "@app/screens/SearchScreen/useSearchActions";
import { CacheKey, CustomListView, MediaFilter } from "@app/enums";
import type { TMDBShow } from "@app/types";
import SlidingTabs from "../../components/SlidingTabs";
import NotFoundArt from "../../components/NotFoundArt";
import SkeletonBlock from "../../components/SkeletonBlock";
import ErrorState from "../../components/ErrorState";
import { describeSearchError } from "@app/utils/loadError";
import { useCollapsingHeader } from "../../hooks/useCollapsingHeader";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { useElementHeight } from "../../hooks/useElementHeight";
import { Paths, showPath, SEARCH_TYPE_PARAM } from "../../routes/paths";
import AddToListSheet from "../../components/AddToListSheet";
import SearchCard from "./SearchCard";
import { mediaTypeOf } from "./mediaTypeOf";
import SearchModals from "./SearchModals";
import styles from "./styles/SearchScreen.module.scss";
import { cssVars, px } from "../../utils/cssVars";

/** Placeholder cards while results load (fills 2-5 columns) and under the list while more
 *  batches are to come — the searchTitles CF takes longer than one TMDB page did */
const LOADING_CARDS = 10;
const MORE_CARDS = 6;
const skeletons = (count: number, view: CustomListView) =>
	Array.from({ length: count }, (_, i) => (
		<SkeletonBlock
			key={`skeleton-${i}`}
			className={view === CustomListView.GRID ? styles.skeletonCard : styles.skeletonRow}
		/>
	));

const FILTER_TABS = [
	{ key: MediaFilter.ALL, label: "All" },
	{ key: MediaFilter.TV, label: "TV" },
	{ key: MediaFilter.MOVIE, label: "Movies" },
];

// Horizontal drag (px) on the results that goes back to Trending — same as Watch History's tabs
const SWIPE_BACK_PX = 60;
/** Landing page for guests; same trending/search + add flows as the app's SearchScreen */
export default function SearchScreen() {
	const navigate = useNavigate();
	const [params, setParams] = useSearchParams();
	// A longer one from a shared or hand-typed URL would only get an error from the search
	const submittedQuery = (params.get("q") ?? "").slice(0, SEARCH_MAX_QUERY_LENGTH);
	const mediaFilter =
		Object.values(MediaFilter).find((f) => f === params.get(SEARCH_TYPE_PARAM)) ?? MediaFilter.ALL;
	const setMediaFilter = (filter: MediaFilter) =>
		setParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				if (filter === MediaFilter.ALL) next.delete(SEARCH_TYPE_PARAM);
				else next.set(SEARCH_TYPE_PARAM, filter);
				return next;
			},
			{ replace: true },
		);
	// Grid / List, remembered across visits (Trending and results share it)
	const [view, setView] = useCustomListView(CacheKey.SEARCH_VIEW, CustomListView.GRID);
	const isGrid = view === CustomListView.GRID;
	const layoutClass = isGrid ? styles.grid : styles.rows;
	const [headerRef, headerHeight] = useElementHeight<HTMLElement>();
	// Follows the scroll continuously
	const headerY = useCollapsingHeader(headerHeight);

	const actions = useSearchActions();
	const signedIn = !!actions.user;
	// Custom lists: which results are already in one, and the title the "Add to List" sheet is open for
	const { lists } = useCustomLists(actions.user?.uid);
	const listedKeys = useMemo(() => listedTitleKeys(lists), [lists]);
	const [listTarget, setListTarget] = useState<TMDBShow | null>(null);
	const listEntry = useMemo(
		() => (listTarget ? entryFromSearchResult(listTarget) : null),
		[listTarget],
	);

	const {
		data: searchData,
		isLoading: searchLoading,
		error: searchError,
		refetch: retrySearch,
		fetchNextPage,
		hasNextPage,
	} = useSearch(submittedQuery, mediaFilter);
	const { data: trending, isLoading: trendingLoading } = useTrending("all");

	const items = useMemo(() => {
		if (submittedQuery) return searchData?.results ?? [];
		return (trending ?? []).filter(
			(item) => mediaFilter === MediaFilter.ALL || (mediaTypeOf(item) as string) === mediaFilter,
		);
	}, [submittedQuery, searchData?.results, trending, mediaFilter]);
	const isLoading = submittedQuery ? searchLoading : trendingLoading;

	const loadMore = useCallback(() => {
		if (submittedQuery && hasNextPage) fetchNextPage();
	}, [submittedQuery, hasNextPage, fetchNextPage]);
	const sentinel = useInfiniteScroll(loadMore, !!submittedQuery && !!hasNextPage);

	// The input opens over this page, so backing out of it returns here, whatever was typed. A new
	// search replaces these results (SearchInputScreen): back from it goes to Trending
	const openInput = () =>
		navigate(
			`${Paths.SEARCH_INPUT}${submittedQuery ? `?q=${encodeText(submittedQuery)}` : ""}`,
			{ state: { overResults: !!submittedQuery } },
		);
	const handlePress = useCallback(
		(item: TMDBShow) => navigate(showPath(mediaTypeOf(item), item.id)),
		[navigate],
	);

	const cards = useMemo(
		() =>
			items.map((item) => (
				<SearchCard
					key={`${item.media_type || "x"}_${item.id}`}
					item={item}
					canTrack={signedIn}
					isInWatchlist={actions.trackedIds.has(item.id)}
					isAdding={actions.addingIds.has(item.id)}
					isListed={listedKeys.has(listItemKey(item.id, mediaTypeOf(item)))}
					layout={view}
					onPress={handlePress}
					onAdd={actions.handleAddToWatchlist}
					onRemove={actions.handleRemoveFromWatchlist}
					onAddToList={setListTarget}
				/>
			)),
		[
			items,
			signedIn,
			listedKeys,
			view,
			actions.trackedIds,
			actions.addingIds,
			actions.handleAddToWatchlist,
			actions.handleRemoveFromWatchlist,
			handlePress,
		],
	);

	return (
		<div
			className={`${styles.container} pt-(--header-h)`}
			style={cssVars({ "--header-h": px(headerHeight) })}
		>
			<motion.header
				ref={headerRef}
				className={`${styles.headerBlock} ${signedIn ? styles.headerBlockTabs : ""}`}
				style={{ y: headerY }}
			>
				{!signedIn && (
					<div className={styles.guestBar}>
						<img src="/logo.png" alt="" className={styles.guestLogo} />
						<span className={styles.guestBrand}>Watchloom</span>
						<div className={styles.guestActions}>
							<Button onClick={() => navigate(Paths.LOGIN)}>Sign in</Button>
							<Button type="primary" onClick={() => navigate(`${Paths.LOGIN}?mode=signup`)}>
								Sign up
							</Button>
						</div>
					</div>
				)}
				{/* Its ::before blacks out everything above the island's middle — only the area around
				    its rounded bottom corners shows the results */}
				<div className={styles.headerCardWrap}>
					<div className={styles.headerCard}>
						<div className={styles.searchBarRow}>
							{submittedQuery ? (
								<button
									className={styles.backButton}
									onClick={() => navigate(Paths.SEARCH)}
									aria-label="Back"
								>
									<IoChevronBackCircleOutline size={30} />
								</button>
							) : (
								<span className={styles.searchIconWrap}>
									<IoSearch size={18} color="var(--text-muted)" />
								</span>
							)}
							<button className={styles.searchRow} onClick={openInput}>
								{submittedQuery || "Search Shows & Movies"}
							</button>
							{/* Same ✕ as the suggestions page: drops the search and reopens it empty */}
							{submittedQuery && (
								<button
									type="button"
									className={styles.clearButton}
									onClick={() => navigate(Paths.SEARCH_INPUT, { state: { overResults: true } })}
									aria-label="Clear search"
								>
									<IoIosCloseCircle size={20} />
								</button>
							)}
							<button
								type="button"
								className={styles.viewToggle}
								onClick={() => setView(isGrid ? CustomListView.LIST : CustomListView.GRID)}
								aria-label={isGrid ? "Show as list" : "Show as grid"}
							>
								{isGrid ? <IoList size={20} /> : <IoGrid size={18} />}
							</button>
						</div>
						<SlidingTabs
							id="search-filter"
							tabs={FILTER_TABS}
							activeKey={mediaFilter}
							onTabPress={setMediaFilter}
						/>
					</div>
				</div>
			</motion.header>

			{!submittedQuery && <h2 className={styles.sectionTitle}>Trending</h2>}

			{isLoading ? (
				<div className={layoutClass}>{skeletons(LOADING_CARDS, view)}</div>
			) : submittedQuery && searchError && items.length === 0 ? (
				// Failed (busy / offline), not empty: say so, with a retry
				<ErrorState
					info={describeSearchError(searchError)}
					primary={{ label: "Try Again", onPress: () => retrySearch() }}
				/>
			) : submittedQuery && items.length === 0 ? (
				<div className="relative z-1 flex min-h-[calc(100dvh-var(--header-h))] flex-col items-center justify-end px-8 pb-[calc(var(--art-h)+24px)] text-center [--art-h:max(0px,min(50dvh,560px,calc(90dvh-280px)))]">
					<NotFoundArt src="/no-results.webp" />
					<p className={styles.empty}>NOTHING FOUND</p>
					<p className={styles.emptyHint}>
						Searched the database, but nothing happened. Have you lost the way?
					</p>
				</div>
			) : submittedQuery ? (
				// Results: swipe right goes back to Trending (vertical scroll stays native)
				<motion.div
					drag="x"
					dragDirectionLock
					dragConstraints={{ left: 0, right: 0 }}
					dragElastic={0.2}
					className={`${layoutClass} touch-pan-y`}
					onDragEnd={(_, info) => {
						if (info.offset.x > SWIPE_BACK_PX) navigate(Paths.SEARCH);
					}}
				>
					{cards}
					{hasNextPage && skeletons(MORE_CARDS, view)}
				</motion.div>
			) : (
				<div className={layoutClass}>{cards}</div>
			)}
			<div ref={sentinel} />

			{signedIn && <AddToListSheet entry={listEntry} onClose={() => setListTarget(null)} />}

			{signedIn && (
				<SearchModals
					movieModal={actions.movieModal}
					onMovieModalClose={() => actions.setMovieModal(null)}
					onMovieAddOnly={actions.handleMovieAddOnly}
					onMovieAddAndWatch={actions.handleMovieAddAndWatch}
					removeModal={actions.removeModal}
					removeError={actions.removeError}
					watchedBlock={actions.watchedBlock}
					onGoToShow={(item) => {
						actions.setWatchedBlock(null);
						handlePress(item);
					}}
					onWatchedBlockClose={() => actions.setWatchedBlock(null)}
					removing={actions.removing}
					onConfirmRemove={actions.handleConfirmRemove}
					onRemoveModalClose={() => {
						actions.setRemoveModal(null);
						actions.setRemoveError(null);
					}}
					unreleasedModal={actions.unreleasedModal}
					onUnreleasedClose={() => actions.setUnreleasedModal(null)}
					resumeModal={actions.resumeModal}
					onResumeFromWhere={actions.handleResumeFromWhere}
					onStartFresh={actions.handleStartFresh}
					onResumeModalClose={() => actions.setResumeModal(null)}
					addFailure={actions.addFailure}
					onRetryAdd={actions.retryAdd}
					onAddFailureClose={actions.dismissAddFailure}
				/>
			)}
		</div>
	);
}
