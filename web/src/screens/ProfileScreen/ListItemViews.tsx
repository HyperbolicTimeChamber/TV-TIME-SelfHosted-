import { useEffect, useMemo, useState } from "react";
import { Reorder, useDragControls } from "motion/react";
import { IoAdd, IoCheckmarkCircleOutline, IoReorderThree } from "react-icons/io5";
import { Spin } from "antd";
import { MediaType } from "@app/enums";
import type { CustomListItem, TMDBShow } from "@app/types";
import { useShowDetails } from "@app/hooks/useShowDetails";
import { useTitleInfo } from "@app/hooks/useTitleInfo";
import { useTitleLogo } from "@app/hooks/useTitleLogo";
import { useTrackingEntry } from "@app/hooks/useTrackingEntry";
import { useAuthStore } from "@app/stores";
import { catalogSettled, ensureFreshCatalogs } from "@app/hooks/catalogRefresh";
import { getCachedCatalogShow } from "@app/hooks/useWatchlist";
import { deriveHistoryCard } from "@app/utils/historyCard";
import { deriveListTags } from "@app/utils/listCardTags";
import { todayStr } from "@app/utils/todayStr";
import { tmdbBackdropUri, tmdbLogoUri, tmdbPosterUri } from "@app/hooks/useTmdbImage";
import { formatRuntime } from "@app/utils/customLists";
import { useLongPress } from "../../hooks/useLongPress";
import PosterImage from "../../components/PosterImage";
import SkeletonBlock from "../../components/SkeletonBlock";
import ListCardTags from "./ListCardTags";
import SearchCard from "../SearchScreen/SearchCard";
import ShowDrawer from "../../components/ShowDrawer";
import type { ShowDrawerAction } from "../../components/ShowDrawer";
import styles from "./styles/ListDetail.module.scss";

/** TV / MOVIE pill — the one on Search's cards */
function TypeBadge({ mediaType }: { mediaType: MediaType }) {
	return (
		<span
			className={`${styles.typeBadge} ${mediaType === MediaType.MOVIE ? styles.typeBadgeMovie : ""}`}
		>
			{mediaType === MediaType.TV ? "TV" : "MOVIE"}
		</span>
	);
}

interface ItemProps {
	item: CustomListItem;
	onPress: () => void;
	/** Long press (hold 0.5s) or right-click */
	onLongPress: () => void;
}

interface RowProps extends ItemProps {
	/** On the watchlist already (a green Tracking tag instead of the add button) */
	tracked: boolean;
	adding: boolean;
	onAddToWatchlist: (show: TMDBShow) => void;
}

/** What the shared add flow takes (Search's): a movie's release date decides whether it is added
 *  as unreleased (app addShow) */
function toShow(item: CustomListItem, info: ReturnType<typeof useTitleInfo>["data"]): TMDBShow {
	const isMovie = item.mediaType === MediaType.MOVIE;
	return {
		id: item.tmdbId,
		media_type: item.mediaType,
		...(isMovie ? { title: item.title } : { name: item.title }),
		poster_path: item.posterPath ?? info?.posterPath ?? null,
		backdrop_path: info?.backdropPath ?? null,
		overview: "",
		vote_average: 0,
		genre_ids: [],
		...(isMovie
			? { release_date: info?.releaseDate ?? undefined }
			: { first_air_date: info?.releaseDate ?? undefined }),
	};
}

/**
 * Grid view (app ListGridCard): Search's own result card for a saved title, minus the Add to List
 * button (it is in a list already). Year and release date come from the title's info.
 */
export function ListGridCard({
	item,
	tracked,
	adding,
	onPress,
	onLongPress,
	onAdd,
	onRemove,
}: {
	item: CustomListItem;
	tracked: boolean;
	adding: boolean;
	onPress: (item: CustomListItem) => void;
	onLongPress: (item: CustomListItem) => void;
	onAdd: (show: TMDBShow) => void;
	onRemove: (show: TMDBShow) => void;
}) {
	const { data: info } = useTitleInfo(item.tmdbId, item.mediaType);
	const show = useMemo(() => toShow(item, info), [item, info]);
	return (
		<SearchCard
			item={show}
			canTrack
			isInWatchlist={tracked}
			isAdding={adding}
			onPress={() => onPress(item)}
			onLongPress={() => onLongPress(item)}
			onAdd={onAdd}
			onRemove={onRemove}
		/>
	);
}

/** Grid view: just the poster */
export function ListCell({ item, onPress, onLongPress }: ItemProps) {
	const press = useLongPress(onLongPress, onPress);
	return (
		<button className={styles.posterButton} aria-label={item.title} {...press}>
			<PosterImage
				posterPath={item.posterPath}
				mediaType={item.mediaType}
				className={styles.poster}
				title={!item.posterPath ? item.title : undefined}
				width={180}
			/>
		</button>
	);
}

/** Card width the backdrop / logo are requested at (calendar CARD_MAX_WIDTH) */
const CARD_MAX_WIDTH = 440;
/** Wait this long for a logo before showing the name (app NAME_DELAY_MS) */
const NAME_DELAY_MS = 2000;

/**
 * List view (app ListRow): a calendar card for a saved title — blurred backdrop, logo (name when
 * there's none) over its TV / MOVIE pill and runtime, and the square holding a show's episode count /
 * a movie's year.
 */
export function ListRow({
	item,
	onPress,
	onLongPress,
	tracked,
	adding,
	onAddToWatchlist,
}: RowProps) {
	const { data: info, isPending: infoLoading } = useTitleInfo(item.tmdbId, item.mediaType);
	const logoPath = useTitleLogo(undefined, item.tmdbId, item.mediaType);
	const [waited, setWaited] = useState(false);
	useEffect(() => {
		const t = window.setTimeout(() => setWaited(true), NAME_DELAY_MS);
		return () => window.clearTimeout(t);
	}, []);
	const press = useLongPress(onLongPress, onPress);
	const isMovie = item.mediaType === MediaType.MOVIE;
	const runtime = formatRuntime(info?.runtime);
	const seasons = info?.totalSeasons;
	// A show: its season count beside the TV tag, its episode count in the square (app ListRow)
	const square = isMovie
		? { label: "YEAR", value: info?.year ?? null }
		: { label: "EPISODES", value: info?.totalEpisodes ? String(info.totalEpisodes) : null };
	// Tags: Watch History's, from the title's own tracking doc (none → Not Started)
	const userId = useAuthStore((st) => st.user?.uid);
	const entry = useTrackingEntry(userId, item.tmdbId, item.mediaType);
	const [catalogVersion, setCatalogVersion] = useState(0);
	useEffect(() => {
		// A tracked show's progress needs its episode list: one batched catalog read, then cached
		if (!entry || isMovie) return;
		ensureFreshCatalogs([entry])
			.catch(() => false)
			.then((fetched) => fetched && setCatalogVersion((v) => v + 1));
	}, [entry, isMovie]);
	const tags = useMemo(() => {
		if (entry === undefined) return null;
		const card = entry
			? deriveHistoryCard(
					entry,
					getCachedCatalogShow(item.tmdbId, item.mediaType),
					todayStr(),
					catalogSettled(item.tmdbId, item.mediaType),
				)
			: null;
		return deriveListTags(card, isMovie);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [entry, catalogVersion, item.tmdbId, item.mediaType, isMovie]);
	// A show: its season count; a movie: its runtime (the year is in the square), in a translucent black pill
	const metaText = isMovie
		? runtime
		: seasons
			? `${seasons} ${seasons === 1 ? "Season" : "Seasons"}`
			: "";
	const showName = logoPath === null || (!logoPath && waited);
	// Still looking for the logo (and not yet time for the name): shimmer where it will sit
	const logoLoading = logoPath === undefined && !waited;
	return (
		<button className={styles.card} aria-label={item.title} {...press}>
			{info?.backdropPath ? (
				<img
					src={tmdbBackdropUri(info.backdropPath, CARD_MAX_WIDTH)}
					alt=""
					className={styles.cardBg}
					loading="lazy"
				/>
			) : info && item.posterPath ? (
				// No backdrop on TMDB (e.g. not aired yet): the poster, blurred to a wash of its colours
				<img
					src={tmdbPosterUri(item.posterPath, 185)}
					alt=""
					className={`${styles.cardBg} ${styles.cardBgPoster}`}
					loading="lazy"
				/>
			) : infoLoading ? (
				<SkeletonBlock className={styles.cardBgSkeleton} />
			) : null}
			<span className={styles.cardOverlay} />
			<span className={styles.cardInfo}>
				{/* Fixed slot: the card never shifts as the logo / name arrives */}
				<span className={styles.logoSlot}>
					{logoPath ? (
						<img
							src={tmdbLogoUri(logoPath, CARD_MAX_WIDTH * 0.6)}
							alt={item.title}
							className={styles.cardLogo}
						/>
					) : showName ? (
						<span className={styles.cardName}>{item.title}</span>
					) : logoLoading ? (
						<SkeletonBlock className={styles.skeletonLogo} />
					) : null}
				</span>
				{/* Centred between the logo and the tags, so it is equidistant from both */}
				<span className={styles.metaArea}>
					<span className={styles.rowMetaLine}>
						<TypeBadge mediaType={item.mediaType} />
						{infoLoading ? (
							<SkeletonBlock className={styles.skeletonMeta} />
						) : metaText ? (
							<span className={styles.metaPill}>{metaText}</span>
						) : null}
					</span>
				</span>
				{/* Level with the add button / Tracking tag under the square */}
				<span className={styles.tagsRow}>
					{tags ? (
						<ListCardTags tags={tags} flush />
					) : (
						<SkeletonBlock className={styles.skeletonTags} />
					)}
				</span>
			</span>
			<span className={styles.rightCol}>
				<span className={styles.square}>
					<span className={styles.squareTitle}>{square.label}</span>
					<span className={styles.squareRule} />
					{infoLoading ? (
						<SkeletonBlock className={styles.skeletonValue} />
					) : (
						<span className={styles.squareValue}>{square.value ?? "—"}</span>
					)}
				</span>
				<span className={styles.bottomRow}>
					{tracked ? (
						<span className={styles.trackingTag}>
							<IoCheckmarkCircleOutline size={14} />
							Watchlist
						</span>
					) : (
						// A span, not a button: the card itself is one
						<span
							role="button"
							tabIndex={0}
							aria-label={`Add ${item.title} to watchlist`}
							aria-disabled={adding || infoLoading}
							className={`${styles.addButton} ${adding || infoLoading ? styles.addButtonBusy : ""}`}
							onPointerDown={(e) => e.stopPropagation()}
							onClick={(e) => {
								e.stopPropagation();
								if (adding || infoLoading) return;
								onAddToWatchlist(toShow(item, info));
							}}
							onKeyDown={(e) => {
								if (e.key !== "Enter" && e.key !== " ") return;
								e.preventDefault();
								e.stopPropagation();
								if (adding || infoLoading) return;
								onAddToWatchlist(toShow(item, info));
							}}
						>
							{adding ? <Spin size="small" /> : <IoAdd size={14} />}
							{!adding && "Watchlist"}
						</span>
					)}
				</span>
			</span>
		</button>
	);
}

/** Reorder mode: grab the handle to move the row (framer-motion Reorder item) */
export function ReorderRow({ item }: { item: CustomListItem }) {
	const controls = useDragControls();
	return (
		<Reorder.Item
			value={item}
			dragListener={false}
			dragControls={controls}
			className={styles.reorderRow}
			whileDrag={{ scale: 1.02, boxShadow: "0 8px 24px rgba(0,0,0,0.6)" }}
		>
			<PosterImage
				posterPath={item.posterPath}
				mediaType={item.mediaType}
				className={styles.reorderPoster}
				title={!item.posterPath ? item.title : undefined}
				width={80}
			/>
			<span className={styles.reorderTitle}>{item.title}</span>
			<TypeBadge mediaType={item.mediaType} />
			<span
				className={styles.dragHandle}
				onPointerDown={(e) => controls.start(e)}
				role="button"
				aria-label={`Move ${item.title}`}
			>
				<IoReorderThree size={24} />
			</span>
		</Reorder.Item>
	);
}

interface PreviewProps {
	item: CustomListItem | null;
	actions: ShowDrawerAction[];
	onGoToShow: (item: CustomListItem) => void;
	onClose: () => void;
}

/** The watchlist's preview card for a list item, plus the list actions */
export function ListItemPreview({ item, actions, onGoToShow, onClose }: PreviewProps) {
	// Only the one opened title is looked up (catalog / TMDB); cached for the details page too
	const { data: show } = useShowDetails(item?.tmdbId ?? 0, item?.mediaType ?? MediaType.TV);
	const genreNames = ((show as { genres?: Array<{ name?: string }> } | undefined)?.genres ?? [])
		.map((g) => g.name)
		.filter(Boolean)
		.join(", ");
	const episodeRunTime = (show as { episode_run_time?: number[] } | undefined)?.episode_run_time;
	return (
		<ShowDrawer
			visible={!!item}
			show={
				item
					? {
							tmdbId: item.tmdbId,
							mediaType: item.mediaType,
							title: item.title,
							posterPath: show?.poster_path ?? item.posterPath,
							backdropPath: show?.backdrop_path ?? null,
							// null → skeleton lines while the details load
							overview: show ? show.overview || "" : null,
							year: (show?.first_air_date || show?.release_date || "").substring(0, 4) || null,
							totalSeasons: show?.number_of_seasons ?? null,
							totalEpisodes: show?.number_of_episodes ?? null,
							runtime: show?.runtime ?? episodeRunTime?.[0] ?? null,
							genres: show ? genreNames || "" : null,
							voteAverage: show?.vote_average ?? null,
						}
					: null
			}
			actions={actions}
			onGoToShow={item ? () => onGoToShow(item) : undefined}
			onClose={onClose}
		/>
	);
}
