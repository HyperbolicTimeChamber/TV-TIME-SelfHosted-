import { memo, useCallback, useRef } from "react";
import { Spin } from "antd";
import { MediaType, FreshTag, JUST_AIRED_WINDOW_DAYS } from "@app/enums";
import { todayStr } from "@app/utils/todayStr";
import SwipeableCard, { type SwipeableCardRef } from "./SwipeableCard";
import CheckmarkButton from "./CheckmarkButton";
import PosterImage from "./PosterImage";
import styles from "./styles/ShowCard.module.scss";

const TODAY = todayStr();
const TODAY_MS = new Date(TODAY).getTime();

interface ShowCardItem {
	tmdbId: number;
	mediaType: MediaType;
	status: string;
	nextEpisode: { season: number; episode: number } | null;
	nextEpisodeName?: string | null;
	rewatchCount: number;
	title: string;
	posterPath: string | null;
	nextEpisodeAirDate?: string | null;
	nextNextEpisodeAirDate?: string | null;
	releaseDate?: string | null;
	director?: string | null;
	isSeasonFinale?: boolean;
}

interface Props {
	item: ShowCardItem;
	isWatched?: boolean;
	watchCount?: number;
	isUpdating?: boolean;
	remainingEpisodes?: number | null;
	onSwipeLeft: (item: any) => Promise<void>;
	onSwipeRight: (item: any) => Promise<void>;
	onPress: (tmdbId: number, mediaType: MediaType) => void;
	onTitlePress?: (item: any) => void;
	onCheckmark: (item: any) => Promise<void>;
	onCheckmarkLongPress?: () => void;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Watchlist card (app ShowCard): swipe right = watched, left = stop; fresh tags */
export default memo(function ShowCard({
	item,
	isWatched,
	watchCount,
	isUpdating,
	remainingEpisodes,
	onSwipeLeft,
	onSwipeRight,
	onPress,
	onTitlePress,
	onCheckmark,
	onCheckmarkLongPress,
}: Props) {
	const swipeRef = useRef<SwipeableCardRef>(null);
	const ep = item.nextEpisode ?? (item.mediaType === MediaType.TV ? { season: 1, episode: 1 } : null);
	const episodeLabel = ep ? `S${pad(ep.season)} | E${pad(ep.episode)}` : "Movie";
	const remainingLabel = remainingEpisodes != null && remainingEpisodes > 0 ? `+${remainingEpisodes}` : null;

	const isNewEpisode = item.mediaType === MediaType.TV && item.nextEpisodeAirDate === TODAY;
	const isJustAired = (() => {
		if (item.mediaType !== MediaType.MOVIE || !item.releaseDate) return false;
		const releaseMs = new Date(item.releaseDate).getTime();
		return releaseMs <= TODAY_MS && TODAY_MS - releaseMs <= JUST_AIRED_WINDOW_DAYS * 86400000;
	})();
	const isLastAired =
		item.mediaType === MediaType.TV &&
		!!item.nextEpisodeAirDate &&
		item.nextEpisodeAirDate <= TODAY &&
		(!item.nextNextEpisodeAirDate || item.nextNextEpisodeAirDate > TODAY);
	const isFinale = item.isSeasonFinale && isLastAired;
	const isLatest = isLastAired && !isNewEpisode && !isFinale;

	const handlePress = useCallback(() => {
		if (item.mediaType === MediaType.MOVIE && onTitlePress) onTitlePress(item);
		else onPress(item.tmdbId, item.mediaType);
	}, [onPress, onTitlePress, item]);

	const titlePill = (muted = false) => (
		<button
			className={`${styles.titlePill} ${muted ? styles.mutedPill : ""}`}
			onClick={(e) => {
				e.stopPropagation();
				onTitlePress?.(item);
			}}
			disabled={!onTitlePress || muted}
		>
			<span className={styles.titleText}>{item.title.toUpperCase()}</span>
			{onTitlePress && !muted && <span className={styles.titleArrow}>›</span>}
		</button>
	);

	const movieMeta = (label: string, muted = false) => (
		<>
			<div className={`${styles.movieMetaRow} ${muted ? "opacity-60" : ""}`}>
				<span className={styles.movieBadge}>MOVIE</span>
				{label && (
					<>
						<span className={styles.slantArrow} />
						<span className={styles.freshTag}>{label}</span>
					</>
				)}
			</div>
			{item.director && <span className={`${styles.episodeName} ${muted ? styles.muted : ""}`}>{item.director}</span>}
		</>
	);

	if (isWatched) {
		const wc = watchCount ?? 0;
		return (
			<SwipeableCard
				onSwipeLeft={() => onSwipeLeft(item)}
				onSwipeRight={() => onSwipeRight(item)}
				leftLabel="Rewatch"
				rightLabel={wc > 1 ? "−1" : "Unwatch"}
				persistAfterSwipe={{ left: true, right: wc > 1 }}
			>
				<div className={styles.container} onClick={handlePress} role="button">
					<PosterImage posterPath={item.posterPath} mediaType={item.mediaType} className={`${styles.poster} ${styles.watchedPoster}`} />
					<div className={styles.info}>
						{titlePill(true)}
						{item.mediaType === MediaType.MOVIE ? (
							movieMeta(item.releaseDate?.substring(0, 4) ?? "", true)
						) : (
							<span className={`${styles.episode} ${styles.muted}`}>{episodeLabel}</span>
						)}
						{item.rewatchCount > 0 && (
							<span className={`${styles.tagBadge} ${styles.latestBadge} opacity-50`}>REWATCH {item.rewatchCount}</span>
						)}
					</div>
					<div className={styles.checkmarkWrap} onClick={(e) => e.stopPropagation()}>
						<CheckmarkButton size={38} watched label={wc > 1 ? `${wc}` : undefined} onPress={() => onCheckmark(item)} />
					</div>
				</div>
			</SwipeableCard>
		);
	}

	if (isUpdating) {
		return (
			<div className={styles.updating}>
				<Spin size="small" />
				<span>Watched</span>
			</div>
		);
	}

	return (
		<SwipeableCard ref={swipeRef} onSwipeLeft={() => onSwipeLeft(item)} onSwipeRight={() => onSwipeRight(item)} persistAfterSwipe>
			<div className={styles.container} onClick={handlePress} role="button">
				<PosterImage posterPath={item.posterPath} mediaType={item.mediaType} className={styles.poster} />
				<div className={styles.info}>
					{titlePill()}
					{item.mediaType === MediaType.MOVIE ? (
						movieMeta(isJustAired ? FreshTag.JUST_AIRED : (item.releaseDate?.substring(0, 4) ?? ""))
					) : (
						<>
							<span className={styles.episode}>
								{episodeLabel}
								{remainingLabel && <span className={styles.remaining}> {remainingLabel}</span>}
							</span>
							{item.nextEpisodeName && <span className={styles.episodeName}>{item.nextEpisodeName}</span>}
							{isFinale ? (
								<span className={styles.tagBadge}>{FreshTag.FINALE}</span>
							) : isNewEpisode ? (
								<span className={styles.tagBadge}>{FreshTag.NEW}</span>
							) : isLatest ? (
								<span className={`${styles.tagBadge} ${styles.latestBadge}`}>{FreshTag.LATEST}</span>
							) : null}
						</>
					)}
					{/* Same outlined tag as LATEST */}
					{item.rewatchCount > 0 && (
						<span className={`${styles.tagBadge} ${styles.latestBadge}`}>REWATCH {item.rewatchCount}</span>
					)}
				</div>
				<div className={styles.checkmarkWrap} onClick={(e) => e.stopPropagation()}>
					<CheckmarkButton size={38} onPress={() => swipeRef.current?.triggerSwipeLeft()} onLongPress={onCheckmarkLongPress} />
				</div>
			</div>
		</SwipeableCard>
	);
});
