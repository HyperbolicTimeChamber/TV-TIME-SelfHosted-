import { useEffect, useState } from "react";
import { Reorder, useDragControls } from "motion/react";
import { IoReorderThree } from "react-icons/io5";
import { MediaType } from "@app/enums";
import type { CustomListItem } from "@app/types";
import { useShowDetails } from "@app/hooks/useShowDetails";
import { useTitleInfo } from "@app/hooks/useTitleInfo";
import { useTitleLogo } from "@app/hooks/useTitleLogo";
import { tmdbBackdropUri, tmdbLogoUri, tmdbPosterUri } from "@app/hooks/useTmdbImage";
import { formatRuntime } from "@app/utils/customLists";
import { useLongPress } from "../../hooks/useLongPress";
import PosterImage from "../../components/PosterImage";
import SkeletonBlock from "../../components/SkeletonBlock";
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
export function ListRow({ item, onPress, onLongPress }: ItemProps) {
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
	const square = isMovie
		? { label: "YEAR", value: info?.year ?? null }
		: { label: "EPISODES", value: info?.totalEpisodes ? String(info.totalEpisodes) : null };
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
				<span className={styles.rowMetaLine}>
					<TypeBadge mediaType={item.mediaType} />
					{infoLoading ? (
						<SkeletonBlock className={styles.skeletonMeta} />
					) : (
						runtime && (
							<span className={styles.rowMeta}>{isMovie ? runtime : `${runtime} / ep`}</span>
						)
					)}
				</span>
			</span>
			<span className={styles.square}>
				<span className={styles.squareTitle}>{square.label}</span>
				<span className={styles.squareRule} />
				{infoLoading ? (
					<SkeletonBlock className={styles.skeletonValue} />
				) : (
					<span className={styles.squareValue}>{square.value ?? "—"}</span>
				)}
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
