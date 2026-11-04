import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import InfiniteScroll from "react-infinite-scroll-component";
import {
	useHistoryFacetOptions,
	useHistorySort,
	useWatchHistory,
} from "@app/hooks/useWatchHistory";
import { hasFacets, NO_FACETS } from "@app/utils/historyView";
import type { HistoryFacets } from "@app/types";
import { useCustomLists } from "@app/hooks/useCustomLists";
import { getCachedCatalogShow } from "@app/hooks/useWatchlist";
import { titleListCount } from "@app/utils/customLists";
import type { HistoryCard as HistoryCardData } from "@app/utils";
import { deriveListTags } from "@app/utils/listCardTags";
import { useCustomListView } from "@app/hooks/useCustomListView";
import type { TMDBShow } from "@app/types";
import { IoGrid, IoList } from "react-icons/io5";
import { useAppSelector } from "../../../store";
import AddToListSheet from "../../../components/AddToListSheet";
import {
	CacheKey,
	CircleButtonTone,
	CustomListView,
	HistoryFilter,
	HistorySort,
	MediaType,
} from "@app/enums";
import SlidingTabs from "../../../components/SlidingTabs";
import CircleButton, { CircleBackButton } from "../../../components/CircleButton";
import SearchCard from "../../SearchScreen/SearchCard";
import searchStyles from "../../SearchScreen/styles/SearchScreen.module.scss";
import ListCardTags from "../ListCardTags";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { useHideTabBar } from "../../../hooks/useHideTabBar";
import { Paths, showPath } from "../../../routes/paths";
import HistoryCard from "./HistoryCard";
import HistoryViewPanel from "./HistoryViewPanel";
import { SortButton } from "../../../components/SortPanel";
import Masonry from "../../../components/Masonry";
import { useColumnCount } from "../../../hooks/useColumnCount";
import HistoryEmpty from "./HistoryEmpty";
import styles from "./styles/WatchHistory.module.scss";
import SkeletonBlock from "../../../components/SkeletonBlock";

const TABS = [
	{ key: MediaType.TV, label: "TV Shows" },
	{ key: MediaType.MOVIE, label: "Movies" },
];
const SKELETONS = [0, 1, 2];
// Horizontal drag (px) that flips to the neighbouring tab
const SWIPE_PX = 60;

/** One tab's list — mounted only while active, so the other tab doesn't fetch */
function HistoryList({
	mediaType,
	sort,
	filters,
	facets,
	view,
}: {
	mediaType: MediaType;
	sort: HistorySort;
	filters: ReadonlySet<HistoryFilter>;
	facets: HistoryFacets;
	view: CustomListView;
}) {
	const navigate = useNavigate();
	// Sort / filters run in the Firestore query — still 20 a page
	const { cards, loading, hasMore, error, loadMore } = useWatchHistory(
		mediaType,
		sort,
		filters,
		facets,
	);
	const columns = useColumnCount();
	// Add to List: the title the sheet is open for, and how many lists hold each card's title
	const user = useAppSelector((s) => s.auth.user);
	const { lists } = useCustomLists(user?.uid);
	const [listTarget, setListTarget] = useState<HistoryCardData | null>(null);
	const items = useMemo(
		() => cards.map((c) => ({ ...c, listCount: titleListCount(lists, c.tmdbId, c.mediaType) })),
		[cards, lists],
	);

	if (loading) {
		return (
			<div className={styles.grid} aria-busy>
				{SKELETONS.map((i) => (
					<SkeletonBlock key={i} className={styles.skeleton} />
				))}
			</div>
		);
	}
	if (cards.length === 0) {
		if (error) return <p className={styles.empty}>{error}</p>;
		return (
			<HistoryEmpty mediaType={mediaType} filtered={filters.size > 0 || hasFacets(facets)} />
		);
	}

	return (
		<InfiniteScroll
			dataLength={cards.length}
			next={loadMore}
			hasMore={hasMore}
			loader={
				<div className={styles.footer}>
					<LoadingSpinner />
				</div>
			}
			scrollThreshold={0.8}
			className="overflow-visible!"
		>
			{view === CustomListView.GRID ? (
				// Search's result grid
				<div className={searchStyles.grid}>
					{items.map((card) =>
						card.ready ? (
							<HistoryGridCard
								key={card.id}
								card={card}
								onClick={() => navigate(showPath(card.mediaType, card.tmdbId))}
								onAddToList={() => setListTarget(card)}
							/>
						) : (
							<SkeletonBlock key={card.id} className={styles.gridSkeleton} />
						),
					)}
				</div>
			) : (
				<Masonry
					items={items}
					columns={columns}
					getKey={(card) => card.id}
					renderItem={(card) =>
						// Title / art not here yet → skeleton until both the row and its show are
						card.ready ? (
							<HistoryCard
								card={card}
								onClick={() => navigate(showPath(card.mediaType, card.tmdbId))}
								onAddToList={() => setListTarget(card)}
							/>
						) : (
							<SkeletonBlock className={styles.skeleton} />
						)
					}
					className={styles.masonry}
					columnClassName={styles.masonryColumn}
				/>
			)}
			<AddToListSheet
				entry={
					listTarget
						? {
								tmdbId: listTarget.tmdbId,
								mediaType: listTarget.mediaType,
								title: listTarget.title,
								posterPath:
									getCachedCatalogShow(listTarget.tmdbId, listTarget.mediaType)?.posterPath ?? null,
							}
						: null
				}
				onClose={() => setListTarget(null)}
			/>
		</InfiniteScroll>
	);
}

/** Grid view's card (app HistoryGridCard): Search's poster card, no watchlist badge, the state pills */
function HistoryGridCard({
	card,
	onClick,
	onAddToList,
}: {
	card: HistoryCardData & { listCount?: number };
	onClick: () => void;
	onAddToList: () => void;
}) {
	const isMovie = card.mediaType === MediaType.MOVIE;
	const show = useMemo((): TMDBShow => {
		const catalog = getCachedCatalogShow(card.tmdbId, card.mediaType);
		const date = (isMovie ? catalog?.releaseDate : catalog?.firstAirDate) ?? undefined;
		return {
			id: card.tmdbId,
			media_type: card.mediaType,
			...(isMovie ? { title: card.title } : { name: card.title }),
			poster_path: catalog?.posterPath ?? null,
			backdrop_path: card.backdropPath,
			overview: "",
			vote_average: 0,
			genre_ids: [],
			...(isMovie ? { release_date: date } : { first_air_date: date }),
		};
	}, [card, isMovie]);
	const tags = useMemo(() => deriveListTags(card), [card]);
	return (
		<SearchCard
			item={show}
			canTrack
			isInWatchlist
			isAdding={false}
			isListed={(card.listCount ?? 0) > 0}
			overlay={tags.map((t) => (
				// Solid backing: the pills are translucent, which lost them on a busy poster
				<span key={t.kind} className={styles.gridTagBacking}>
					<ListCardTags tags={[t]} flush />
				</span>
			))}
			onPress={onClick}
			onAddToList={onAddToList}
		/>
	);
}

/** Watch History (app WatchHistoryScreen): TV Shows | Movies, newest watch first, no tab bar */
export default function WatchHistoryScreen() {
	const navigate = useNavigate();
	const [tab, setTab] = useState<MediaType>(MediaType.TV);
	// +1 → new tab slides in from the right, -1 from the left
	const [dir, setDir] = useState(1);
	useHideTabBar();
	// Sort is remembered (cache); filters only last while this page is open
	const [sort, setSort] = useHistorySort();
	const [filters, setFilters] = useState<Set<HistoryFilter>>(() => new Set());
	const [panelOpen, setPanelOpen] = useState(false);
	// Genre / Keyword filters: both tabs, also only while this page is open
	const [facets, setFacets] = useState<HistoryFacets>(NO_FACETS);
	const facetOptions = useHistoryFacetOptions(tab, panelOpen);
	const toggleFacet = (key: keyof HistoryFacets, value: string) =>
		setFacets((prev) => {
			const next = new Set(prev[key]);
			if (next.has(value)) next.delete(value);
			else next.add(value);
			return { ...prev, [key]: next };
		});
	// Grid / List, remembered (List: the cards this page always had)
	const [view, setView] = useCustomListView(CacheKey.HISTORY_VIEW, CustomListView.LIST);
	const noFilters = useMemo(() => new Set<HistoryFilter>(), []);
	// Filters are TV-only (every movie in history is simply watched)
	const tabFilters = tab === MediaType.MOVIE ? noFilters : filters;
	const customised = sort !== HistorySort.LAST_WATCHED || tabFilters.size > 0 || hasFacets(facets);
	const toggleFilter = (f: HistoryFilter) =>
		setFilters((prev) => {
			const next = new Set(prev);
			if (next.has(f)) next.delete(f);
			else next.add(f);
			return next;
		});
	const index = TABS.findIndex((t) => t.key === tab);
	const goTo = (next: number) => {
		if (next < 0 || next >= TABS.length || next === index) return;
		setDir(next > index ? 1 : -1);
		setTab(TABS[next].key);
	};

	// Opened directly (no history entry) → back goes to Profile
	const goBack = () =>
		(window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate(Paths.PROFILE);

	return (
		<div>
			{/* layoutRoot: the tab pill's layout animation measures inside this sticky header,
			    not against the scrolled page (otherwise it jumps after scrolling) */}
			<motion.header layoutRoot className={styles.topBar}>
				<div className={styles.titleRow}>
					<CircleBackButton tone={CircleButtonTone.SURFACE_LIGHT} onClick={goBack} />
					<h1 className={styles.title}>Hall of Shame</h1>
					{/* Same size as the back button, so the title stays centred on the bar */}
					<CircleButton
						tone={CircleButtonTone.SURFACE_LIGHT}
						onClick={() =>
							setView(view === CustomListView.GRID ? CustomListView.LIST : CustomListView.GRID)
						}
						ariaLabel={view === CustomListView.GRID ? "Show as list" : "Show as grid"}
					>
						{view === CustomListView.GRID ? <IoList size={20} /> : <IoGrid size={18} />}
					</CircleButton>
				</div>
				<div className={styles.tabsRow}>
					<SlidingTabs
						id="history-tabs"
						tabs={TABS}
						activeKey={tab}
						onTabPress={(key) => goTo(TABS.findIndex((t) => t.key === key))}
						className={styles.tabs}
					/>
					{/* Sort / filter */}
					<SortButton
						label="Sort and filter"
						open={panelOpen}
						onOpenChange={setPanelOpen}
						customised={customised}
						content={
							<HistoryViewPanel
								isMovie={tab === MediaType.MOVIE}
								sort={sort}
								// Stays open like the filters under it (app HistoryViewSheet)
								onSort={setSort}
								filters={tabFilters}
								onToggleFilter={toggleFilter}
								onClearFilters={() => {
									setFilters(new Set());
									setFacets(NO_FACETS);
								}}
								facets={facets}
								facetOptions={facetOptions}
								onToggleGenre={(g) => toggleFacet("genres", g)}
								onToggleKeyword={(k) => toggleFacet("keywords", k)}
							/>
						}
					/>
				</div>
			</motion.header>
			{/* Swipe left/right between TV Shows and Movies (vertical scroll stays native);
			    swiping right on TV Shows goes back, like the app */}
			<AnimatePresence mode="wait" initial={false} custom={dir}>
				<motion.div
					key={tab}
					custom={dir}
					initial={{ x: `${dir * 30}%`, opacity: 0 }}
					animate={{ x: 0, opacity: 1 }}
					exit={{ x: `${dir * -30}%`, opacity: 0 }}
					transition={{ duration: 0.18 }}
					drag="x"
					dragDirectionLock
					dragConstraints={{ left: 0, right: 0 }}
					dragElastic={0.2}
					className="touch-pan-y"
					onDragEnd={(_, info) => {
						if (info.offset.x < -SWIPE_PX) goTo(index + 1);
						else if (info.offset.x > SWIPE_PX) {
							if (index === 0) goBack();
							else goTo(index - 1);
						}
					}}
				>
					<HistoryList
						mediaType={tab}
						sort={sort}
						filters={tabFilters}
						facets={facets}
						view={view}
					/>
				</motion.div>
			</AnimatePresence>
		</div>
	);
}
