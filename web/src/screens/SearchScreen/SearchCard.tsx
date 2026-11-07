import { HiCheck } from "react-icons/hi";
import { memo, type ReactNode } from "react";
import { Spin } from "antd";
import { IoAdd, IoBookmark, IoBookmarkOutline } from "react-icons/io5";
import { motion } from "motion/react";
import { CustomListView, MediaType } from "@app/enums";
import { tmdbBlurredBackdropUri } from "@app/hooks/useTmdbImage";
import { useLongPress } from "../../hooks/useLongPress";
import type { TMDBShow } from "@app/types";
import PosterImage from "../../components/PosterImage";
import styles from "./styles/SearchScreen.module.scss";
import { mediaTypeOf } from "./mediaTypeOf";

interface Props {
	item: TMDBShow;
	/** Guests browse read-only: no watchlist badge */
	canTrack: boolean;
	isInWatchlist: boolean;
	isAdding: boolean;
	/** In at least one custom list */
	isListed?: boolean;
	/** Grid (poster card, default) or List (a row: poster, title, meta, overview) */
	layout?: CustomListView;
	onPress: (item: TMDBShow) => void;
	/** Without these the card has no watchlist badge (Hall of Shame: everything there is tracked) */
	onAdd?: (item: TMDBShow) => void;
	onRemove?: (item: TMDBShow) => void;
	/** Pills over the poster's top-left (a list's own grid: the title's state tags) */
	overlay?: ReactNode;
	/** In place of the title / year banner (Hall of Shame's grid: title + its stats) */
	footer?: ReactNode;
	/** Without it the card has no Add to List button (a list's own grid) */
	onAddToList?: (item: TMDBShow) => void;
	onLongPress?: (item: TMDBShow) => void;
}

function SearchCard({
	item,
	canTrack,
	isInWatchlist,
	isAdding,
	isListed = false,
	layout = CustomListView.GRID,
	onPress,
	onAdd,
	onRemove,
	onAddToList,
	onLongPress,
	overlay,
	footer,
}: Props) {
	const title = item.name || item.title || "";
	const year = (item.first_air_date || item.release_date || "").substring(0, 4);
	const mediaType = mediaTypeOf(item);
	const press = useLongPress(onLongPress ? () => onLongPress(item) : undefined, () =>
		onPress(item),
	);
	const isList = layout === CustomListView.LIST;
	const typeBadge = (
		<span
			className={`${styles.typeBadge} ${mediaType === MediaType.MOVIE ? styles.typeBadgeMovie : ""}`}
		>
			{mediaType === MediaType.TV ? "TV" : "MOVIE"}
		</span>
	);
	const watchlistBadge = canTrack && onAdd && onRemove && (
		<button
			className={`${styles.badge} ${isList ? styles.rowBadge : ""} ${isInWatchlist ? styles.badgeActive : ""}`}
			aria-label={isInWatchlist ? "Remove from watchlist" : "Add to watchlist"}
			disabled={isAdding}
			onClick={(e) => {
				e.stopPropagation();
				if (isAdding) return;
				if (isInWatchlist) onRemove(item);
				else onAdd(item);
			}}
		>
			{/* Vector glyphs sit in the middle of their box — a text "+" rode high and off centre */}
			{isAdding ? (
				<Spin size="small" />
			) : isInWatchlist ? (
				<HiCheck size={18} />
			) : (
				<IoAdd size={18} />
			)}
		</button>
	);
	const listBadge = canTrack && onAddToList && (
		<button
			className={`${styles.listBadge} ${onAdd ? "" : styles.listBadgeTop} ${isList ? styles.rowBadge : ""} ${isListed ? styles.listBadgeActive : ""}`}
			aria-label="Add to List"
			onClick={(e) => {
				e.stopPropagation();
				onAddToList(item);
			}}
		>
			{isListed ? <IoBookmark size={14} /> : <IoBookmarkOutline size={14} />}
		</button>
	);

	if (isList) {
		return (
			<motion.div
				className={styles.rowCard}
				{...press}
				whileTap={{ opacity: 0.7 }}
				role="link"
				aria-label={title}
			>
				{item.backdrop_path && (
					<img
						src={tmdbBlurredBackdropUri(item.backdrop_path)}
						alt=""
						className={styles.rowBackdrop}
						loading="lazy"
					/>
				)}
				<PosterImage
					posterPath={item.poster_path}
					mediaType={mediaType}
					className={styles.rowPoster}
					width={92}
				/>
				<div className={styles.rowInfo}>
					<span className={styles.rowTitle}>{title}</span>
					<div className={styles.rowMeta}>
						{typeBadge}
						{year && <span>{year}</span>}
						{item.vote_average > 0 && <span>★ {item.vote_average.toFixed(1)}</span>}
					</div>
					{item.overview && <span className={styles.rowOverview}>{item.overview}</span>}
				</div>
				{(watchlistBadge || listBadge) && (
					<div className={styles.rowBadges}>
						{watchlistBadge}
						{listBadge}
					</div>
				)}
			</motion.div>
		);
	}

	return (
		<motion.div
			className={styles.card}
			{...press}
			whileTap={{ opacity: 0.7 }}
			role="link"
			aria-label={title}
		>
			<PosterImage
				posterPath={item.poster_path}
				mediaType={mediaType}
				className={styles.poster}
				width={180}
			/>
			{watchlistBadge}
			{listBadge}
			{overlay && <div className={styles.overlayTags}>{overlay}</div>}
			{footer ?? (
				<div className={styles.banner}>
					<div className={styles.bannerTop}>
						<span className={styles.cardTitle}>{title}</span>
						<div className={styles.bannerSide}>
							{typeBadge}
							{year && <span className={styles.cardYear}>{year}</span>}
						</div>
					</div>
				</div>
			)}
		</motion.div>
	);
}

export default memo(SearchCard);
