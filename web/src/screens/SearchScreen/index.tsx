import { useCallback, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Button } from "antd";
import { IoChevronBack, IoSearch } from "react-icons/io5";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSearch } from "@app/hooks/useSearch";
import { useTrending } from "@app/hooks/useTrending";
import { useSearchActions } from "@app/screens/SearchScreen/useSearchActions";
import { MediaFilter } from "@app/enums";
import type { TMDBShow } from "@app/types";
import SlidingTabs from "../../components/SlidingTabs";
import NotFoundArt from "../../components/NotFoundArt";
import LoadingScreen from "../../components/LoadingScreen";
import { useCollapsingHeader } from "../../hooks/useCollapsingHeader";
import { useInfiniteScroll } from "../../hooks/useInfiniteScroll";
import { useElementHeight } from "../../hooks/useElementHeight";
import { Paths, showPath } from "../../routes/paths";
import SearchCard from "./SearchCard";
import { mediaTypeOf } from "./mediaTypeOf";
import SearchModals from "./SearchModals";
import styles from "./styles/SearchScreen.module.scss";
import { cssVars, px } from "../../utils/cssVars";

const FILTER_TABS = [
	{ key: MediaFilter.ALL, label: "All" },
	{ key: MediaFilter.TV, label: "TV" },
	{ key: MediaFilter.MOVIE, label: "Movies" },
];

/** Landing page for guests; same trending/search + add flows as the app's SearchScreen */
export default function SearchScreen() {
	const navigate = useNavigate();
	const [params] = useSearchParams();
	const submittedQuery = params.get("q") ?? "";
	const [mediaFilter, setMediaFilter] = useState<MediaFilter>(MediaFilter.ALL);
	const headerVisible = useCollapsingHeader();
	const [headerRef, headerHeight] = useElementHeight<HTMLElement>();

	const actions = useSearchActions();
	const signedIn = !!actions.user;

	const { data: searchData, isLoading: searchLoading, fetchNextPage, hasNextPage } = useSearch(
		submittedQuery,
		mediaFilter,
	);
	const { data: trending, isLoading: trendingLoading } = useTrending("all");

	const items = useMemo(() => {
		if (submittedQuery) return searchData?.results ?? [];
		return (trending ?? []).filter(
			(item) => mediaFilter === MediaFilter.ALL || (mediaTypeOf(item) as string) === mediaFilter,
		);
	}, [submittedQuery, searchData, trending, mediaFilter]);
	const isLoading = submittedQuery ? searchLoading : trendingLoading;

	const loadMore = useCallback(() => {
		if (submittedQuery && hasNextPage) fetchNextPage();
	}, [submittedQuery, hasNextPage, fetchNextPage]);
	const sentinel = useInfiniteScroll(loadMore, !!submittedQuery && !!hasNextPage);

	const openInput = () =>
		navigate(`${Paths.SEARCH_INPUT}${submittedQuery ? `?q=${encodeURIComponent(submittedQuery)}` : ""}`);
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
					onPress={handlePress}
					onAdd={actions.handleAddToWatchlist}
					onRemove={actions.handleRemoveFromWatchlist}
				/>
			)),
		[items, signedIn, actions.trackedIds, actions.addingIds, actions.handleAddToWatchlist, actions.handleRemoveFromWatchlist, handlePress],
	);

	return (
		<div className={`${styles.container} pt-(--header-h)`} style={cssVars({ "--header-h": px(headerHeight) })}>
			<motion.header
				ref={headerRef}
				className={styles.headerBlock}
				animate={{ y: headerVisible ? 0 : "-100%" }}
				transition={{ duration: 0.2 }}
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
				<div className={styles.headerCard}>
					<div className={styles.searchBarRow}>
						{submittedQuery ? (
							<button className={styles.backButton} onClick={() => navigate(Paths.SEARCH)} aria-label="Back">
								<IoChevronBack size={24} />
							</button>
						) : (
							<span className={styles.searchIconWrap}>
								<IoSearch size={18} color="var(--text-muted)" />
							</span>
						)}
						<button className={styles.searchRow} onClick={openInput}>
							{submittedQuery || "Search Shows & Movies"}
						</button>
					</div>
					<SlidingTabs id="search-filter" tabs={FILTER_TABS} activeKey={mediaFilter} onTabPress={setMediaFilter} />
				</div>
			</motion.header>

			{!submittedQuery && <h2 className={styles.sectionTitle}>Trending</h2>}

			{isLoading ? (
				<LoadingScreen />
			) : submittedQuery && items.length === 0 ? (
				<div className="relative z-1 flex min-h-[calc(100dvh-var(--header-h))] flex-col items-center justify-end px-8 pb-[calc(var(--art-h)+16px)] text-center">
					<NotFoundArt src="/no-results.png" />
					<p className={styles.empty}>NOTHING FOUND</p>
					<p className={styles.emptyHint}>Try a different title or check the spelling</p>
				</div>
			) : (
				<div className={styles.grid}>{cards}</div>
			)}
			<div ref={sentinel} />

			{signedIn && (
				<SearchModals
					movieModal={actions.movieModal}
					onMovieModalClose={() => actions.setMovieModal(null)}
					onMovieAddOnly={actions.handleMovieAddOnly}
					onMovieAddAndWatch={actions.handleMovieAddAndWatch}
					removeModal={actions.removeModal}
					removeError={actions.removeError}
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
				/>
			)}
		</div>
	);
}
