import React, { memo, useRef, useCallback, useMemo, useLayoutEffect, useState } from "react";
import Animated, {
	Easing,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { similarProps } from "../utils/similarProps";
import { withHaptic } from "../utils/haptics";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { MediaType, FreshTag, JUST_AIRED_WINDOW_DAYS, WatchStatus } from "../types";
import { colors, spacing, typography, themedStyles } from "../theme";
import { CARD_RADIUS } from "../enums";
import SwipeableCard, { SwipeableCardRef } from "./SwipeableCard";
import CheckmarkButton, { WATCHLIST_CHECK_CIRCLE, WATCHLIST_CHECK_TICK } from "./CheckmarkButton";

import PosterImage from "./PosterImage";
import CardInfo, { CARD_MAX_FONT_SCALE, cardStyles, CARD_POSTER_WIDTH } from "./CardInfo";
import { todayStr } from "../utils";
import { requireOnline } from "../utils/requireOnline";

// Computed once per app session — avoids Date allocation per card per render
const TODAY = todayStr();
const TODAY_MS = new Date(TODAY).getTime();
/** A mark is in and the card stays (its next episode up): the green "Watched" banner it waited on
 *  flips over into the updated card — edge-on halfway, where the banner goes, and the card turns
 *  the rest of the way flat (as an unwatched card flips). Swapped at once, it blinked away. A
 *  card with nothing next leaves the list instead (the watchlist shrinks its banner away) */
const MARK_FLIP_MS = 520;
const MARK_FLIP_EASING = Easing.inOut(Easing.cubic);

interface ShowCardItem {
	tmdbId: number;
	mediaType: MediaType;
	status: string;
	nextEpisode: { season: number; episode: number } | null;
	nextEpisodeName?: string | null;
	rewatchCount: number;
	title: string;
	posterPath: string | null;
	totalEpisodes?: number;
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
	/** Resolving false = nothing happened (offline): the card snaps straight back */
	onSwipeLeft: (item: any) => Promise<boolean | void>;
	/** Omit to turn that swipe off */
	onSwipeRight?: (item: any) => Promise<boolean | void>;
	/** Long press on the card (haptic included) */
	onLongPress?: (item: any) => void;
	onPress: (tmdbId: number, mediaType: MediaType) => void;
	onTitlePress?: (item: any) => void;
	onCheckmark: (item: any) => Promise<void>;
	onCheckmarkLongPress?: () => void;
}

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
	onCheckmark: _onCheckmark,
	onCheckmarkLongPress,
	onLongPress,
}: Props) {
	const ep =
		item.nextEpisode ?? (item.mediaType === MediaType.TV ? { season: 1, episode: 1 } : null);
	const episodeLabel = ep
		? `S${String(ep.season).padStart(2, "0")} | E${String(ep.episode).padStart(2, "0")}`
		: "Movie";

	const remainingLabel =
		remainingEpisodes != null && remainingEpisodes > 0 ? `+${remainingEpisodes}` : null;

	// Only while actually rewatching — a count left over from a dropped rewatch isn't one
	const rewatching = item.status === WatchStatus.REWATCHING && item.rewatchCount > 0;

	// "NEW" tag: TV episode aired today
	const isNewEpisode =
		item.mediaType === MediaType.TV && item.nextEpisodeAirDate && item.nextEpisodeAirDate === TODAY;

	// "JUST AIRED" tag: movie released within last 7 days
	const isJustAired = (() => {
		if (item.mediaType !== MediaType.MOVIE || !item.releaseDate) return false;
		const releaseMs = new Date(item.releaseDate).getTime();
		const todayMs = TODAY_MS;
		const sevenDaysMs = JUST_AIRED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
		return releaseMs <= todayMs && todayMs - releaseMs <= sevenDaysMs;
	})();

	// Last aired: episode has aired and no subsequent episode has aired yet
	const isLastAired =
		item.mediaType === MediaType.TV &&
		item.nextEpisodeAirDate &&
		item.nextEpisodeAirDate <= TODAY &&
		(!item.nextNextEpisodeAirDate || item.nextNextEpisodeAirDate > TODAY);

	// "FINALE" tag: season finale + no more episodes released after
	const isFinale = item.isSeasonFinale && isLastAired;

	// "LATEST" tag: last aired episode, not NEW, not FINALE
	const isLatest = isLastAired && !isNewEpisode && !isFinale;

	const swipeRef = useRef<SwipeableCardRef>(null);

	// Updating → updated, same title (not a recycled row taking another one): the banner flips
	// over into the card. The flip's value sits at its start while the banner shows, so the card
	// takes over from it with the banner on top, unturned — no frame of the card alone
	const cardKey = `${item.mediaType}_${item.tmdbId}`;
	const updatingFor = useRef<string | null>(isUpdating ? cardKey : null);
	const flipFor = useRef<string | null>(null);
	const [flipping, setFlipping] = useState(false);
	const flip = useSharedValue(1);
	const flipDone = useCallback(() => setFlipping(false), []);
	useLayoutEffect(() => {
		if (isUpdating) {
			updatingFor.current = cardKey;
			flip.value = 0;
			return;
		}
		if (updatingFor.current === cardKey && !isWatched) {
			flipFor.current = cardKey;
			setFlipping(true);
			flip.value = withTiming(1, { duration: MARK_FLIP_MS, easing: MARK_FLIP_EASING }, (done) => {
				if (done) runOnJS(flipDone)();
			});
		} else {
			flip.value = 1;
		}
		updatingFor.current = null;
	}, [isUpdating, cardKey, isWatched, flip, flipDone]);
	// 0 → ½: the banner turns edge-on; ½ → 1: the card turns from edge-on to flat
	const flipStyle = useAnimatedStyle(() => ({
		transform: [
			{ perspective: 800 },
			{ rotateX: `${flip.value < 0.5 ? 180 * flip.value : 180 * flip.value - 180}deg` },
		],
	}));
	const bannerHalf = useAnimatedStyle(() => ({ opacity: flip.value < 0.5 ? 1 : 0 }));
	// Recycled into another title meanwhile: that flip was the old title's
	const showBanner = flipping && flipFor.current === cardKey;

	const handlePress = useCallback(() => {
		if (item.mediaType === MediaType.MOVIE && onTitlePress) {
			onTitlePress(item);
		} else {
			onPress(item.tmdbId, item.mediaType);
		}
	}, [onPress, onTitlePress, item]);
	const handleTitlePress = useCallback(() => onTitlePress?.(item), [onTitlePress, item]);
	const handleSwipeLeft = useCallback(() => onSwipeLeft(item), [onSwipeLeft, item]);
	const handleSwipeRight = useCallback(
		() => onSwipeRight?.(item) ?? Promise.resolve(),
		[onSwipeRight, item],
	);
	const handleLongPress = useMemo(
		() => withHaptic(onLongPress && (() => onLongPress(item))),
		[onLongPress, item],
	);

	if (isWatched) {
		const wc = watchCount ?? 0;
		return (
			<SwipeableCard
				// Recycled list row → fresh swipe state for the new title
				resetKey={`${item.mediaType}_${item.tmdbId}`}
				onSwipeLeft={handleSwipeLeft}
				onSwipeRight={handleSwipeRight}
				leftLabel="Rewatch"
				rightLabel="Unwatch"
				rightIcon={wc > 1 ? "−1" : undefined}
				persistAfterSwipe={{ left: true, right: wc > 1 }}
				// A rewatch / a −1 that keeps the row: its banner flips over into the updated row
				flipBack
			>
				<TouchableOpacity
					style={cardStyles.container}
					onPress={handlePress}
					onLongPress={handleLongPress}
					activeOpacity={0.8}
				>
					<PosterImage
						posterPath={item.posterPath}
						mediaType={item.mediaType}
						style={[cardStyles.poster, styles.watchedPoster]}
					/>
					<CardInfo
						title={item.title}
						titlePillStyle={[styles.watchedTitlePill, styles.watchedFade]}
						titleTextStyle={styles.watchedMuted}
						subline={item.mediaType === MediaType.MOVIE ? item.director : null}
						sublineStyle={[styles.watchedMuted, styles.watchedFade]}
					>
						{item.mediaType === MediaType.MOVIE ? (
							<>
								{/* The card fades its own parts rather than the whole subtree, so the year
								    number alone can stay at full strength. The amber behind it is faded
								    through a translucent fill, not opacity, which would take the number
								    with it */}
								<View style={styles.movieMetaRow}>
									<View style={styles.movieBadgeGroup}>
										<View style={[styles.movieBadgeMerged, styles.watchedFade]}>
											<Text
												maxFontSizeMultiplier={CARD_MAX_FONT_SCALE}
												style={styles.movieBadgeText}
											>
												MOVIE
											</Text>
										</View>
										{item.releaseDate && (
											<>
												<View style={[styles.slantArrow, styles.watchedFade]} />
												<View style={[styles.freshTag, styles.watchedFreshTag]}>
													<Text
														maxFontSizeMultiplier={CARD_MAX_FONT_SCALE}
														style={[styles.freshTagText, styles.watchedYear]}
													>
														{item.releaseDate.substring(0, 4)}
													</Text>
												</View>
											</>
										)}
									</View>
									{item.rewatchCount > 0 && (
										<View
											style={[
												styles.tagBadge,
												styles.inlineTag,
												styles.latestBadge,
												styles.mutedTag,
											]}
										>
											<Text
												maxFontSizeMultiplier={CARD_MAX_FONT_SCALE}
												style={[styles.tagBadgeText, styles.latestBadgeText]}
											>
												REWATCH {item.rewatchCount}
											</Text>
										</View>
									)}
								</View>
							</>
						) : (
							// The REWATCH tag on the episode's line (as on an active card)
							<View style={styles.episodeRow}>
								<Text
									maxFontSizeMultiplier={CARD_MAX_FONT_SCALE}
									style={[cardStyles.episode, styles.watchedMuted, styles.watchedFade]}
								>
									{episodeLabel}
								</Text>
								{item.rewatchCount > 0 && (
									<View
										style={[styles.tagBadge, styles.inlineTag, styles.latestBadge, styles.mutedTag]}
									>
										<Text
											maxFontSizeMultiplier={CARD_MAX_FONT_SCALE}
											style={[styles.tagBadgeText, styles.latestBadgeText]}
										>
											REWATCH {item.rewatchCount}
										</Text>
									</View>
								)}
							</View>
						)}
					</CardInfo>
					<View style={[styles.checkmarkWrap, styles.watchedFade]}>
						<CheckmarkButton
							size={WATCHLIST_CHECK_CIRCLE}
							checkSize={WATCHLIST_CHECK_TICK}
							watched
							label={wc > 1 ? `${wc}` : undefined}
							onPress={() => _onCheckmark(item)}
							// Long-press too opens the watch count sheet (not the card's pause)
							onLongPress={() => _onCheckmark(item)}
						/>
					</View>
				</TouchableOpacity>
			</SwipeableCard>
		);
	}

	if (isUpdating) {
		return (
			<View style={styles.updatingContainer}>
				<ActivityIndicator color={colors.text} size="small" />
				<Text maxFontSizeMultiplier={CARD_MAX_FONT_SCALE} style={styles.updatingText}>
					Watched
				</Text>
			</View>
		);
	}

	// Always in the flip's view (a wrapper added only for the flip would remount the card)
	return (
		<Animated.View style={flipStyle}>
			<SwipeableCard
				resetKey={`${item.mediaType}_${item.tmdbId}`}
				ref={swipeRef}
				onSwipeLeft={handleSwipeLeft}
				onSwipeRight={onSwipeRight ? handleSwipeRight : undefined}
				persistAfterSwipe
			>
				<TouchableOpacity
					style={cardStyles.container}
					onPress={handlePress}
					onLongPress={handleLongPress}
					activeOpacity={0.8}
				>
					<PosterImage
						posterPath={item.posterPath}
						mediaType={item.mediaType}
						style={cardStyles.poster}
					/>
					{/* A rewatch's REWATCH N: a tab in the poster's bottom-left corner (the card's rounded
					    corner clips it) */}
					{rewatching && (
						<View style={styles.cornerTag}>
							<Text maxFontSizeMultiplier={CARD_MAX_FONT_SCALE} style={styles.cornerTagText}>
								REWATCH {item.rewatchCount}
							</Text>
						</View>
					)}
					<CardInfo
						title={item.title}
						onTitlePress={onTitlePress ? handleTitlePress : undefined}
						subline={item.mediaType === MediaType.MOVIE ? item.director : item.nextEpisodeName}
						sublineLines={item.mediaType === MediaType.MOVIE ? 1 : 2}
					>
						{item.mediaType === MediaType.MOVIE ? (
							<>
								<View style={styles.movieMetaRow}>
									<View style={styles.movieBadgeGroup}>
										<View style={styles.movieBadgeMerged}>
											<Text
												maxFontSizeMultiplier={CARD_MAX_FONT_SCALE}
												style={styles.movieBadgeText}
											>
												MOVIE
											</Text>
										</View>
										<View style={styles.slantArrow} />
										<View style={styles.freshTag}>
											<Text maxFontSizeMultiplier={CARD_MAX_FONT_SCALE} style={styles.freshTagText}>
												{isJustAired
													? FreshTag.JUST_AIRED
													: (item.releaseDate?.substring(0, 4) ?? "")}
											</Text>
										</View>
									</View>
								</View>
							</>
						) : (
							<>
								{/* The episode's tag sits on its line, so a tagged card is no taller than the
								    rest; LATEST already says nothing's left, so no +N beside it. A rewatch shows
								    only FINALE here, and its +N (its REWATCH tag is the poster's corner tab) */}
								<View style={styles.episodeRow}>
									<Text maxFontSizeMultiplier={CARD_MAX_FONT_SCALE} style={cardStyles.episode}>
										{episodeLabel}
										{remainingLabel && (rewatching || !(isLatest && !isFinale && !isNewEpisode)) ? (
											<Text maxFontSizeMultiplier={CARD_MAX_FONT_SCALE} style={styles.remaining}>
												{" "}
												{remainingLabel}
											</Text>
										) : null}
									</Text>
									{isFinale ? (
										<View style={[styles.tagBadge, styles.inlineTag, styles.finaleBadge]}>
											<Text
												maxFontSizeMultiplier={CARD_MAX_FONT_SCALE}
												style={[styles.tagBadgeText, styles.finaleBadgeText]}
											>
												{FreshTag.FINALE}
											</Text>
										</View>
									) : rewatching ? null : isNewEpisode ? (
										<View style={[styles.tagBadge, styles.inlineTag]}>
											<Text maxFontSizeMultiplier={CARD_MAX_FONT_SCALE} style={styles.tagBadgeText}>
												{FreshTag.NEW}
											</Text>
										</View>
									) : isLatest ? (
										<View style={[styles.tagBadge, styles.inlineTag, styles.latestBadge]}>
											<Text
												maxFontSizeMultiplier={CARD_MAX_FONT_SCALE}
												style={[styles.tagBadgeText, styles.latestBadgeText]}
											>
												{FreshTag.LATEST}
											</Text>
										</View>
									) : null}
								</View>
							</>
						)}
					</CardInfo>
					<View style={styles.checkmarkWrap}>
						<CheckmarkButton
							size={WATCHLIST_CHECK_CIRCLE}
							checkSize={WATCHLIST_CHECK_TICK}
							onPress={() => requireOnline() && swipeRef.current?.triggerSwipeLeft()}
							onLongPress={onCheckmarkLongPress}
						/>
					</View>
				</TouchableOpacity>
			</SwipeableCard>
			{showBanner && (
				<Animated.View
					style={[styles.updatingContainer, styles.flipBanner, bannerHalf]}
					pointerEvents="none"
				>
					<ActivityIndicator color={colors.text} size="small" />
					<Text maxFontSizeMultiplier={CARD_MAX_FONT_SCALE} style={styles.updatingText}>
						Watched
					</Text>
				</Animated.View>
			)}
		</Animated.View>
	);
}, similarProps);

const styles = themedStyles(() => StyleSheet.create({
	// Same fade as WatchedEpisodeRow, but per element instead of over the whole card: a
	// container opacity also dims the movie year, which has to stay readable. The card keeps
	// `container`'s surface — SwipeableCard paints the same surface behind it, so the old
	// container-wide 0.5 never actually darkened the background, only the content.
	watchedFade: {
		opacity: 0.5,
	},
	watchedPoster: {
		opacity: 0.3,
	},
	watchedTitlePill: {
		borderColor: colors.textMuted,
	},
	movieBadgeGroup: {
		flexDirection: "row",
		alignItems: "stretch",
	},
	movieBadgeMerged: {
		backgroundColor: colors.moviePurple,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		borderRadius: 4,
		justifyContent: "center",
		borderTopRightRadius: 0,
		borderBottomRightRadius: 0,
	},
	movieBadgeText: {
		fontSize: 10,
		fontWeight: "700",
		color: colors.text,
		letterSpacing: 0.5,
	},
	remaining: {
		color: colors.textMuted,
		fontSize: 12,
		fontWeight: "400",
	},
	watchedMuted: {
		color: colors.textMuted,
	},
	mutedTag: { opacity: 0.5 },
	updatingContainer: {
		minHeight: CARD_POSTER_WIDTH,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
		backgroundColor: colors.watchedGreen,
		borderRadius: CARD_RADIUS,
		marginHorizontal: spacing.md,
	},
	flipBanner: {
		...(StyleSheet.absoluteFill as object),
		left: spacing.md,
		right: spacing.md,
		marginHorizontal: 0,
		minHeight: 0,
		zIndex: 2,
	},
	updatingText: {
		...typography.subtitle,
		color: colors.text,
	},
	slantArrow: {
		width: 0,
		height: 0,
		borderTopWidth: 9,
		borderTopColor: colors.warningAmber,
		borderBottomWidth: 9,
		borderBottomColor: colors.warningAmber,
		borderLeftWidth: 5,
		borderLeftColor: colors.moviePurple,
	},
	freshTag: {
		backgroundColor: colors.warningAmber,
		paddingHorizontal: spacing.sm,
		borderTopRightRadius: 4,
		borderBottomRightRadius: 4,
		justifyContent: "center",
	},
	freshTagText: {
		fontSize: 10,
		fontWeight: "700",
		color: colors.onAmber,
		letterSpacing: 0.5,
	},
	// Previously watched: half-strength amber, so only the year number reads at full strength
	watchedFreshTag: {
		backgroundColor: colors.warningAmberFaded,
	},
	// …and black on that muted amber, where the surface-grey went brownish
	watchedYear: {
		color: colors.onAmber,
	},
	tagBadge: {
		alignSelf: "flex-start",
		backgroundColor: colors.warningAmber,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		borderRadius: 4,
		marginTop: spacing.sm,
	},
	tagBadgeText: {
		fontSize: 10,
		fontWeight: "700",
		color: colors.onAmber,
		letterSpacing: 0.5,
	},
	// Episode line: "S02 | E10" and its tag, centred on each other, 8 apart
	episodeRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	inlineTag: { marginTop: 0, alignSelf: "center" },
	cornerTag: {
		position: "absolute",
		left: 0,
		bottom: 0,
		backgroundColor: colors.accent,
		paddingHorizontal: spacing.md,
		paddingVertical: 3,
		borderTopRightRadius: CARD_RADIUS,
	},
	cornerTagText: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.onPrimary,
		letterSpacing: 0.5,
	},
	// NEW uses the default tag look (yellow, dark text); FINALE and LATEST are solid blue
	finaleBadge: {
		backgroundColor: colors.accent,
	},
	finaleBadgeText: {
		color: colors.onPrimary,
	},
	latestBadge: {
		backgroundColor: colors.accent,
	},
	latestBadgeText: {
		color: colors.onPrimary,
	},
	// Movie: MOVIE / year tags, and a REWATCH tag beside them
	movieMetaRow: {
		flexDirection: "row",
		alignItems: "center",
		// Room before a REWATCH tag
		gap: spacing.sm,
	},
	checkmarkWrap: {
		alignSelf: "center",
		paddingRight: spacing.md,
	},
}));
