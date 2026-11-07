import { memo, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Spin } from "antd";
import { MediaType, FreshTag, JUST_AIRED_WINDOW_DAYS, WatchStatus } from "@app/enums";
import { todayStr } from "@app/utils/todayStr";
import SwipeableCard, { type SwipeableCardRef } from "./SwipeableCard";
import { useLongPress } from "../hooks/useLongPress";
import CheckmarkButton, { WATCHLIST_CHECK_CIRCLE, WATCHLIST_CHECK_TICK } from "./CheckmarkButton";
import PosterImage from "./PosterImage";
import CardInfo from "./CardInfo";
import styles from "./styles/ShowCard.module.scss";

const TODAY = todayStr();
const TODAY_MS = new Date(TODAY).getTime();
/** The green "Watched" banner flipping over into the card once a mark is in (app parity) */
const MARK_FLIP_S = 0.52;
/** Edge-on halfway: the banner goes there and the card turns the rest of the way flat */
const MARK_FLIP_TIMES = [0, 0.5, 0.5, 1];

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
	// Updating → updated, same title: the card stays (its next episode up), so the green banner
	// it waited on flips over into it — swapped at once, it blinked away. A card with nothing
	// next leaves the list instead (app parity)
	const cardKey = `${item.mediaType}_${item.tmdbId}`;
	const updatingFor = useRef<string | null>(isUpdating ? cardKey : null);
	const flipFor = useRef<string | null>(null);
	const [flip, setFlip] = useState(0);
	useLayoutEffect(() => {
		if (isUpdating) {
			updatingFor.current = cardKey;
			return;
		}
		if (updatingFor.current === cardKey && !isWatched) {
			flipFor.current = cardKey;
			setFlip((n) => n + 1);
		}
		updatingFor.current = null;
	}, [isUpdating, cardKey, isWatched]);
	const flipping = flip > 0 && flipFor.current === cardKey;
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
				// A rewatch / a −1 that keeps the row: its banner flips over into the updated row
				flipBack
			>
				<div className={styles.container} onClick={handlePress} role="button">
					<PosterImage
						posterPath={item.posterPath}
						mediaType={item.mediaType}
						className={`${styles.poster} ${styles.watchedPoster}`}
					/>
					<CardInfo
						pill={<span className={styles.watchedFade}>{titlePill(true)}</span>}
						subline={item.mediaType === MediaType.MOVIE ? item.director : null}
						sublineClassName={`${styles.muted} ${styles.watchedFade}`}
					>
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
					</CardInfo>
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

	// Always in the flip's element (one added only for the flip would remount the card)
	return (
		<motion.div
			className={styles.flipHost}
			style={{ transformPerspective: 800 }}
			animate={flipping ? { rotateX: [0, 90, -90, 0] } : { rotateX: 0 }}
			transition={
				flipping
					? { duration: MARK_FLIP_S, ease: "easeInOut", times: MARK_FLIP_TIMES }
					: { duration: 0 }
			}
			onAnimationComplete={() => flipping && setFlip(0)}
		>
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
					{/* A rewatch's REWATCH N: a tab in the poster's bottom-left corner (the card's rounded
				    corner clips it) (app parity) */}
					{rewatching && <span className={styles.cornerTag}>REWATCH {item.rewatchCount}</span>}
					<CardInfo
						pill={titlePill()}
						subline={item.mediaType === MediaType.MOVIE ? item.director : item.nextEpisodeName}
						twoLineSubline={item.mediaType !== MediaType.MOVIE}
					>
						{item.mediaType === MediaType.MOVIE ? (
							movieMeta(
								isJustAired ? FreshTag.JUST_AIRED : (item.releaseDate?.substring(0, 4) ?? ""),
							)
						) : (
							<>
								{/* The episode's tag sits on its line, so a tagged card is no taller than the
							    rest; LATEST already says nothing's left, so no +N beside it. A rewatch shows
							    only FINALE here, and its +N (its REWATCH tag is the poster's corner tab) (app parity) */}
								<span className={styles.episodeRow}>
									<span className={styles.episode}>
										{episodeLabel}
										{remainingLabel &&
											(rewatching || !(isLatest && !isFinale && !isNewEpisode)) && (
												<span className={styles.remaining}> {remainingLabel}</span>
											)}
									</span>
									{isFinale ? (
										<span className={`${styles.tagBadge} ${styles.inlineTag}`}>
											{FreshTag.FINALE}
										</span>
									) : rewatching ? null : isNewEpisode ? (
										<span className={`${styles.tagBadge} ${styles.inlineTag} ${styles.newBadge}`}>
											{FreshTag.NEW}
										</span>
									) : isLatest ? (
										<span
											className={`${styles.tagBadge} ${styles.inlineTag} ${styles.latestBadge}`}
										>
											{FreshTag.LATEST}
										</span>
									) : null}
								</span>
							</>
						)}
					</CardInfo>
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
			{flipping && (
				<motion.div
					className={`${styles.updating} ${styles.flipBanner}`}
					aria-hidden
					initial={{ opacity: 1 }}
					animate={{ opacity: [1, 1, 0, 0] }}
					transition={{ duration: MARK_FLIP_S, times: MARK_FLIP_TIMES }}
				>
					<Spin size="small" />
					<span>Watched</span>
				</motion.div>
			)}
		</motion.div>
	);
});
