import React, { memo, useRef, useCallback, useMemo } from "react";
import { similarProps } from "../utils/similarProps";
import { withHaptic } from "../utils/haptics";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { MediaType, FreshTag, JUST_AIRED_WINDOW_DAYS, WatchStatus } from "../types";
import { colors, spacing, typography } from "../theme";
import { CARD_RADIUS } from "../enums";
import SwipeableCard, { SwipeableCardRef } from "./SwipeableCard";
import CheckmarkButton, { WATCHLIST_CHECK_CIRCLE, WATCHLIST_CHECK_TICK } from "./CheckmarkButton";

import PosterImage from "./PosterImage";
import CardInfo, { cardStyles, CARD_POSTER_WIDTH } from "./CardInfo";
import { todayStr } from "../utils";

// Computed once per app session — avoids Date allocation per card per render
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
	onSwipeLeft: (item: any) => Promise<void>;
	/** Omit to turn that swipe off */
	onSwipeRight?: (item: any) => Promise<void>;
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

	// The poster's corner tag: REWATCH N on a rewatch (episode or movie), else the episode's tag
	const cornerTag = rewatching
		? `REWATCH ${item.rewatchCount}`
		: isFinale
			? FreshTag.FINALE
			: isNewEpisode
				? FreshTag.NEW
				: isLatest
					? FreshTag.LATEST
					: null;
	const blueCornerTag = rewatching || cornerTag === FreshTag.LATEST;

	const swipeRef = useRef<SwipeableCardRef>(null);

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
											<Text style={styles.movieBadgeText}>MOVIE</Text>
										</View>
										{item.releaseDate && (
											<>
												<View style={[styles.slantArrow, styles.watchedFade]} />
												<View style={[styles.freshTag, styles.watchedFreshTag]}>
													<Text style={[styles.freshTagText, styles.watchedYear]}>
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
											<Text style={[styles.tagBadgeText, styles.latestBadgeText]}>
												REWATCH {item.rewatchCount}
											</Text>
										</View>
									)}
								</View>
							</>
						) : (
							// The REWATCH tag on the episode's line (as on an active card)
							<View style={styles.episodeRow}>
								<Text style={[cardStyles.episode, styles.watchedMuted, styles.watchedFade]}>
									{episodeLabel}
								</Text>
								{item.rewatchCount > 0 && (
									<View
										style={[styles.tagBadge, styles.inlineTag, styles.latestBadge, styles.mutedTag]}
									>
										<Text style={[styles.tagBadgeText, styles.latestBadgeText]}>
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
				<Text style={styles.updatingText}>Watched</Text>
			</View>
		);
	}

	return (
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
				{/* The card's REWATCH / FINALE / NEW / LATEST tag: a tab in the poster's bottom-left
				    corner (the card's rounded corner clips it); REWATCH and LATEST blue */}
				{cornerTag && (
					<View style={[styles.cornerTag, blueCornerTag && styles.cornerTagLatest]}>
						<Text style={[styles.cornerTagText, blueCornerTag && styles.cornerTagLatestText]}>
							{cornerTag}
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
										<Text style={styles.movieBadgeText}>MOVIE</Text>
									</View>
									<View style={styles.slantArrow} />
									<View style={styles.freshTag}>
										<Text style={styles.freshTagText}>
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
							{/* LATEST (the poster's corner tag) already says nothing's left, so no +N here;
							    a rewatch keeps its +N */}
							<View style={styles.episodeRow}>
								<Text style={cardStyles.episode}>
									{episodeLabel}
									{remainingLabel && (rewatching || !(isLatest && !isFinale && !isNewEpisode)) ? (
										<Text style={styles.remaining}> {remainingLabel}</Text>
									) : null}
								</Text>
							</View>
						</>
					)}
				</CardInfo>
				<View style={styles.checkmarkWrap}>
					<CheckmarkButton
						size={WATCHLIST_CHECK_CIRCLE}
						checkSize={WATCHLIST_CHECK_TICK}
						onPress={() => swipeRef.current?.triggerSwipeLeft()}
						onLongPress={onCheckmarkLongPress}
					/>
				</View>
			</TouchableOpacity>
		</SwipeableCard>
	);
}, similarProps);

const styles = StyleSheet.create({
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
		color: colors.surface,
		letterSpacing: 0.5,
	},
	// Previously watched: half-strength amber, so only the year number reads at full strength
	watchedFreshTag: {
		backgroundColor: colors.warningAmberFaded,
	},
	// …and black on that muted amber, where the surface-grey went brownish
	watchedYear: {
		color: colors.background,
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
		color: colors.surface,
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
		backgroundColor: colors.warningAmber,
		paddingHorizontal: spacing.md,
		paddingVertical: 3,
		borderTopRightRadius: CARD_RADIUS,
	},
	cornerTagText: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.surface,
		letterSpacing: 0.5,
	},
	cornerTagLatest: {
		backgroundColor: colors.accent,
	},
	cornerTagLatestText: {
		color: colors.text,
	},
	latestBadge: {
		backgroundColor: "transparent",
		borderWidth: 1,
		borderColor: colors.accent,
	},
	latestBadgeText: {
		color: colors.accent,
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
});
