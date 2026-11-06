import { memo, useCallback, useRef, type ReactNode } from "react";
import { Spin } from "antd";
import { MediaType, FreshTag, JUST_AIRED_WINDOW_DAYS, WatchStatus } from "@app/enums";
import { todayStr } from "@app/utils/todayStr";
import SwipeableCard, { type SwipeableCardRef } from "./SwipeableCard";
import { useLongPress } from "../hooks/useLongPress";
import CheckmarkButton, { WATCHLIST_CHECK_CIRCLE, WATCHLIST_CHECK_TICK } from "./CheckmarkButton";
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
	/** Omit to turn that swipe off */
	onSwipeRight?: (item: any) => Promise<void>;
	/** Long press / right-click on the card */
	onLongPress?: (item: any) => void;
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
	onLongPress,
}: Props) {
	const swipeRef = useRef<SwipeableCardRef>(null);
	const ep =
		item.nextEpisode ?? (item.mediaType === MediaType.TV ? { season: 1, episode: 1 } : null);
	const episodeLabel = ep ? `S${pad(ep.season)} | E${pad(ep.episode)}` : "Movie";
	const remainingLabel =
		remainingEpisodes != null && remainingEpisodes > 0 ? `+${remainingEpisodes}` : null;

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
	// Only while actually rewatching — a count left over from a dropped rewatch isn't one
	const rewatching = item.status === WatchStatus.REWATCHING && item.rewatchCount > 0;
	// Same outlined tag as LATEST, on the episode's / movie's line
	const rewatchTag = (
		<span className={`${styles.tagBadge} ${styles.inlineTag} ${styles.latestBadge}`}>
			REWATCH {item.rewatchCount}
		</span>
	);
	const watchedRewatchTag =
		item.rewatchCount > 0 ? (
			<span className={`${styles.tagBadge} ${styles.inlineTag} ${styles.latestBadge} opacity-50`}>
				REWATCH {item.rewatchCount}
			</span>
		) : null;

	const handlePress = useCallback(() => {
		if (item.mediaType === MediaType.MOVIE && onTitlePress) onTitlePress(item);
		else onPress(item.tmdbId, item.mediaType);
	}, [onPress, onTitlePress, item]);
	const cardPress = useLongPress(onLongPress ? () => onLongPress(item) : undefined, handlePress);

	const titlePill = (muted = false) => (
		<button
			className={`${styles.titlePill} ${item.mediaType === MediaType.MOVIE ? styles.movieTitlePill : ""} ${muted ? styles.mutedPill : ""}`}
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

	const movieMeta = (label: string, muted = false, tag?: ReactNode) => (
		<>
			{/* The card fades its own parts rather than the whole subtree, so the year number
			    alone can stay at full strength. The amber behind it is faded through a
			    translucent fill, not opacity, which would take the number with it */}
			<div className={styles.movieMetaRow}>
				<span className={`${styles.movieBadge} ${muted ? styles.watchedFade : ""}`}>MOVIE</span>
				{label && (
					<>
						<span className={`${styles.slantArrow} ${muted ? styles.watchedFade : ""}`} />
						<span className={`${styles.freshTag} ${muted ? styles.watchedFreshTag : ""}`}>
							{label}
						</span>
					</>
				)}
				{tag}
			</div>
			{item.director && (
				<span
					className={`${styles.episodeName} ${styles.movieDirector} ${muted ? `${styles.muted} ${styles.watchedFade}` : ""}`}
				>
					{item.director}
				</span>
			)}
		</>
	);

	if (isWatched) {
		const wc = watchCount ?? 0;
		return (
			<SwipeableCard
				onSwipeLeft={() => onSwipeLeft(item)}
				onSwipeRight={onSwipeRight ? () => onSwipeRight(item) : undefined}
				leftLabel="Rewatch"
				rightLabel="Unwatch"
				rightIcon={wc > 1 ? "−1" : undefined}
				persistAfterSwipe={{ left: true, right: wc > 1 }}
			>
				<div className={styles.container} onClick={handlePress} role="button">
					<PosterImage
						posterPath={item.posterPath}
						mediaType={item.mediaType}
						className={`${styles.poster} ${styles.watchedPoster}`}
					/>
					<div
						className={`${styles.info} ${item.mediaType === MediaType.MOVIE ? styles.movieInfo : ""}`}
					>
						<span className={styles.watchedFade}>{titlePill(true)}</span>
						{/* The REWATCH tag on the episode's / movie's line (app parity) */}
						{item.mediaType === MediaType.MOVIE ? (
							movieMeta(item.releaseDate?.substring(0, 4) ?? "", true, watchedRewatchTag)
						) : (
							<span className={styles.episodeRow}>
								<span className={`${styles.episode} ${styles.muted} ${styles.watchedFade}`}>
									{episodeLabel}
								</span>
								{watchedRewatchTag}
							</span>
						)}
					</div>
					<div
						className={`${styles.checkmarkWrap} ${styles.watchedFade}`}
						onClick={(e) => e.stopPropagation()}
					>
						<CheckmarkButton
							size={WATCHLIST_CHECK_CIRCLE}
							checkSize={WATCHLIST_CHECK_TICK}
							watched
							label={wc > 1 ? `${wc}` : undefined}
							onPress={() => onCheckmark(item)}
							// Long-press too opens the watch count sheet (not the card's pause)
							onLongPress={() => onCheckmark(item)}
						/>
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
		<SwipeableCard
			ref={swipeRef}
			onSwipeLeft={() => onSwipeLeft(item)}
			onSwipeRight={onSwipeRight ? () => onSwipeRight(item) : undefined}
			persistAfterSwipe
		>
			<div className={styles.container} {...cardPress} role="button">
				<PosterImage
					posterPath={item.posterPath}
					mediaType={item.mediaType}
					className={styles.poster}
				/>
				<div
					className={`${styles.info} ${item.mediaType === MediaType.MOVIE ? styles.movieInfo : ""}`}
				>
					{titlePill()}
					{item.mediaType === MediaType.MOVIE ? (
						movieMeta(
							isJustAired ? FreshTag.JUST_AIRED : (item.releaseDate?.substring(0, 4) ?? ""),
							false,
							rewatchTag,
						)
					) : (
						<>
							{/* The episode's tag sits on its line, so a tagged card is no taller than the
							    rest; LATEST already says nothing's left, so no +N beside it. A rewatch
							    shows only its REWATCH tag there (and its +N) (app parity) */}
							<span className={styles.episodeRow}>
								<span className={styles.episode}>
									{episodeLabel}
									{remainingLabel && (rewatching || !(isLatest && !isFinale && !isNewEpisode)) && (
										<span className={styles.remaining}> {remainingLabel}</span>
									)}
								</span>
								{rewatching ? (
									rewatchTag
								) : isFinale ? (
									<span className={`${styles.tagBadge} ${styles.inlineTag}`}>
										{FreshTag.FINALE}
									</span>
								) : isNewEpisode ? (
									<span className={`${styles.tagBadge} ${styles.inlineTag}`}>{FreshTag.NEW}</span>
								) : isLatest ? (
									<span className={`${styles.tagBadge} ${styles.inlineTag} ${styles.latestBadge}`}>
										{FreshTag.LATEST}
									</span>
								) : null}
							</span>
							{item.nextEpisodeName && (
								<span className={styles.episodeName}>{item.nextEpisodeName}</span>
							)}
						</>
					)}
				</div>
				<div className={styles.checkmarkWrap} onClick={(e) => e.stopPropagation()}>
					<CheckmarkButton
						size={WATCHLIST_CHECK_CIRCLE}
						checkSize={WATCHLIST_CHECK_TICK}
						onPress={() => swipeRef.current?.triggerSwipeLeft()}
						onLongPress={onCheckmarkLongPress}
					/>
				</div>
			</div>
		</SwipeableCard>
	);
});
