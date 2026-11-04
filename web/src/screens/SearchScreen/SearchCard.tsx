import { memo, type ReactNode } from "react";
import { Spin } from "antd";
import { IoAdd, IoBookmark, IoBookmarkOutline, IoCheckmark } from "react-icons/io5";
import { motion } from "motion/react";
import { MediaType } from "@app/enums";
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
	onPress: (item: TMDBShow) => void;
	/** Without these the card has no watchlist badge (Hall of Shame: everything there is tracked) */
	onAdd?: (item: TMDBShow) => void;
	onRemove?: (item: TMDBShow) => void;
	/** Pills over the poster's top-left (a list's own grid: the title's state tags) */
	overlay?: ReactNode;
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
	onPress,
	onAdd,
	onRemove,
	onAddToList,
	onLongPress,
	overlay,
}: Props) {
	const title = item.name || item.title || "";
	const year = (item.first_air_date || item.release_date || "").substring(0, 4);
	const mediaType = mediaTypeOf(item);
	const press = useLongPress(onLongPress ? () => onLongPress(item) : undefined, () =>
		onPress(item),
	);

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
			{canTrack && onAdd && onRemove && (
				<button
					className={`${styles.badge} ${isInWatchlist ? styles.badgeActive : ""}`}
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
						<IoCheckmark size={18} />
					) : (
						<IoAdd size={18} />
					)}
				</button>
			)}
			{canTrack && onAddToList && (
				<button
					className={`${styles.listBadge} ${onAdd ? "" : styles.listBadgeTop} ${isListed ? styles.listBadgeActive : ""}`}
					aria-label="Add to List"
					onClick={(e) => {
						e.stopPropagation();
						onAddToList(item);
					}}
				>
					{isListed ? <IoBookmark size={14} /> : <IoBookmarkOutline size={14} />}
				</button>
			)}
			{overlay && <div className={styles.overlayTags}>{overlay}</div>}
			<div className={styles.banner}>
				<div className={styles.bannerTop}>
					<span className={styles.cardTitle}>{title}</span>
					<span
						className={`${styles.typeBadge} ${mediaType === MediaType.MOVIE ? styles.typeBadgeMovie : ""}`}
					>
						{mediaType === MediaType.TV ? "TV" : "MOVIE"}
					</span>
				</div>
				{year && <span className={styles.cardYear}>{year}</span>}
			</div>
		</motion.div>
	);
}

export default memo(SearchCard);
