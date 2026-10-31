import { memo } from "react";
import { Spin } from "antd";
import { IoBookmark, IoBookmarkOutline } from "react-icons/io5";
import { motion } from "motion/react";
import { MediaType } from "@app/enums";
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
	isListed: boolean;
	onPress: (item: TMDBShow) => void;
	onAdd: (item: TMDBShow) => void;
	onRemove: (item: TMDBShow) => void;
	onAddToList: (item: TMDBShow) => void;
}

function SearchCard({
	item,
	canTrack,
	isInWatchlist,
	isAdding,
	isListed,
	onPress,
	onAdd,
	onRemove,
	onAddToList,
}: Props) {
	const title = item.name || item.title || "";
	const year = (item.first_air_date || item.release_date || "").substring(0, 4);
	const mediaType = mediaTypeOf(item);

	return (
		<motion.div
			className={styles.card}
			onClick={() => onPress(item)}
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
			{canTrack && (
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
					{isAdding ? <Spin size="small" /> : isInWatchlist ? "✓" : "+"}
				</button>
			)}
			{canTrack && (
				<button
					className={`${styles.listBadge} ${isListed ? styles.listBadgeActive : ""}`}
					aria-label="Add to List"
					onClick={(e) => {
						e.stopPropagation();
						onAddToList(item);
					}}
				>
					{isListed ? <IoBookmark size={14} /> : <IoBookmarkOutline size={14} />}
				</button>
			)}
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
