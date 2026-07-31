import React, { memo, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { MediaType, FreshTag, JUST_AIRED_WINDOW_DAYS } from "../types";
import { colors, spacing, typography } from "../theme";
import SwipeableCard, { SwipeableCardRef } from "./SwipeableCard";
import CheckmarkButton from "./CheckmarkButton";
import SkeletonLine from "./SkeletonLine";
import PosterImage from "./PosterImage";

// Computed once per app session — avoids Date allocation per card per render
const TODAY = new Date().toISOString().split("T")[0];
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
	onSwipeRight: (item: any) => Promise<void>;
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
}: Props) {
	const ep =
		item.nextEpisode ?? (item.mediaType === MediaType.TV ? { season: 1, episode: 1 } : null);
	const episodeLabel = ep
		? `S${String(ep.season).padStart(2, "0")} | E${String(ep.episode).padStart(2, "0")}`
		: "Movie";

	const movieYear = item.releaseDate?.substring(0, 4) || null;

	const remainingLabel =
		remainingEpisodes != null && remainingEpisodes > 0
			? `+${remainingEpisodes} ep${remainingEpisodes > 1 ? "s" : ""} left`
			: null;

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

	const handlePress = useCallback(() => {
		if (item.mediaType === MediaType.MOVIE && onTitlePress) {
			onTitlePress(item);
		} else {
			onPress(item.tmdbId, item.mediaType);
		}
	}, [onPress, onTitlePress, item]);
	const handleTitlePress = useCallback(() => onTitlePress?.(item), [onTitlePress, item]);
	const handleSwipeLeft = useCallback(() => onSwipeLeft(item), [onSwipeLeft, item]);
	const handleSwipeRight = useCallback(() => onSwipeRight(item), [onSwipeRight, item]);

	if (isWatched) {
		const wc = watchCount ?? 0;
		return (
			<SwipeableCard
				onSwipeLeft={handleSwipeLeft}
				onSwipeRight={handleSwipeRight}
				leftLabel="Rewatch"
				rightLabel={wc > 1 ? "−1" : "Unwatch"}
				persistAfterSwipe={{ left: true, right: wc > 1 }}
			>
				<TouchableOpacity
					style={[styles.container, styles.watchedContainer]}
					onPress={handlePress}
					activeOpacity={0.8}
				>
					<PosterImage
						posterPath={item.posterPath}
						mediaType={item.mediaType}
						style={[styles.poster, styles.watchedPoster]}
					/>
					<View style={styles.info}>
						<Text style={[styles.watchedTitle, styles.watchedText]} numberOfLines={1}>
							{item.title}
						</Text>
						{item.mediaType === MediaType.MOVIE && item.director && (
							<Text style={[styles.episodeName, styles.watchedText]} numberOfLines={1}>
								{item.director}
							</Text>
						)}
						{item.mediaType === MediaType.MOVIE ? (
							<View style={styles.movieYearRow}>
								{movieYear && <Text style={[styles.movieYearText, styles.watchedText]}>{movieYear}</Text>}
								<View style={[styles.movieBadge, { opacity: 0.6 }]}>
									<Text style={styles.movieBadgeText}>MOVIE</Text>
								</View>
							</View>
						) : (
							<Text style={[styles.episode, styles.watchedText]}>{episodeLabel}</Text>
						)}
						{item.rewatchCount > 0 && (
							<Text style={[styles.rewatch, styles.watchedText]}>Rewatch #{item.rewatchCount}</Text>
						)}
					</View>
					<View style={styles.checkmarkWrap}>
						<CheckmarkButton
							size={36}
							watched
							label={wc > 1 ? `${wc}` : undefined}
							onPress={() => _onCheckmark(item)}
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
			ref={swipeRef}
			onSwipeLeft={handleSwipeLeft}
			onSwipeRight={handleSwipeRight}
			persistAfterSwipe
		>
			<TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={0.8}>
				<PosterImage
					posterPath={item.posterPath}
					mediaType={item.mediaType}
					style={styles.poster}
				/>
				<View style={styles.info}>
					<TouchableOpacity
						style={styles.titleButton}
						onPress={handleTitlePress}
						disabled={!onTitlePress}
					>
						<Text style={styles.titleText} numberOfLines={1}>
							{item.title.toUpperCase()}
						</Text>
						{onTitlePress && <Text style={styles.titleArrow}>›</Text>}
					</TouchableOpacity>
					{item.mediaType === MediaType.MOVIE && item.director ? (
						<Text style={styles.episodeName} numberOfLines={1}>
							{item.director}
						</Text>
					) : item.nextEpisodeName ? (
						<Text style={styles.episodeName} numberOfLines={1}>
							{item.nextEpisodeName}
						</Text>
					) : item.mediaType === MediaType.TV ? (
						<SkeletonLine width="55%" height={11} />
					) : null}
					{item.mediaType === MediaType.MOVIE ? (
						<View style={styles.movieYearRow}>
							{movieYear && <Text style={styles.movieYearText}>{movieYear}</Text>}
							<View style={styles.movieRow}>
								<View style={[styles.movieBadge, isJustAired && styles.movieBadgeMerged]}>
									<Text style={styles.movieBadgeText}>MOVIE</Text>
								</View>
								{isJustAired && (
									<>
										<View style={styles.slantArrow} />
										<View style={styles.freshTag}>
											<Text style={styles.freshTagText}>{FreshTag.JUST_AIRED}</Text>
										</View>
									</>
								)}
							</View>
						</View>
					) : (
						<Text style={styles.episode}>
							{episodeLabel}
							{remainingLabel ? <Text style={styles.remaining}> {remainingLabel}</Text> : null}
							{isFinale ? (
								<Text style={styles.freshTagInline}> {FreshTag.FINALE}</Text>
							) : isNewEpisode ? (
								<Text style={styles.freshTagInline}> {FreshTag.NEW}</Text>
							) : isLatest ? (
								<Text style={styles.latestTagInline}> {FreshTag.LATEST}</Text>
							) : null}
						</Text>
					)}
					{item.rewatchCount > 0 && (
						<Text style={styles.rewatch}>Rewatch #{item.rewatchCount}</Text>
					)}
				</View>
				<View style={styles.checkmarkWrap}>
					<CheckmarkButton
						size={36}
						onPress={() => swipeRef.current?.triggerSwipeLeft()}
						onLongPress={onCheckmarkLongPress}
					/>
				</View>
			</TouchableOpacity>
		</SwipeableCard>
	);
});

const styles = StyleSheet.create({
	container: {
		flex: 1,
		flexDirection: "row",
		alignItems: "flex-start",
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.sm,
		backgroundColor: colors.surface,
	},
	watchedContainer: {
		opacity: 0.4,
	},
	poster: {
		width: 55,
		height: 82,
		borderRadius: 4,
	},
	watchedPoster: {
		opacity: 0.6,
	},
	info: {
		flex: 1,
		marginLeft: spacing.md,
		marginRight: spacing.sm,
		paddingTop: spacing.xs,
	},
	titleButton: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		borderWidth: 1.5,
		borderColor: colors.text,
		borderRadius: 14,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		marginBottom: spacing.sm,
	},
	titleText: {
		fontSize: 11,
		fontWeight: "600",
		color: colors.text,
		flexShrink: 1,
		letterSpacing: 0.5,
	},
	titleArrow: {
		fontSize: 11,
		color: colors.text,
		marginLeft: spacing.xs,
		lineHeight: 13,
	},
	episode: {
		...typography.subtitle,
		fontSize: 16,
		fontWeight: "700",
		color: colors.text,
		letterSpacing: 1,
		marginTop: 2,
		paddingHorizontal: spacing.sm,
	},
	episodeName: {
		...typography.body,
		color: colors.text,
		marginTop: 2,
		fontSize: 13,
		paddingHorizontal: spacing.sm,
	},
	movieBadge: {
		alignSelf: "flex-start",
		backgroundColor: colors.moviePurple,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		borderRadius: 4,
		justifyContent: "center",
		zIndex: 1,
		marginTop: spacing.xs,
	},
	movieBadgeMerged: {
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
		fontSize: 11,
	},
	rewatch: {
		...typography.caption,
		color: colors.accent,
		marginTop: spacing.xs,
		paddingHorizontal: spacing.sm,
	},
	watchedTitle: {
		...typography.subtitle,
	},
	watchedText: {
		color: colors.textMuted,
	},
	updatingContainer: {
		height: 100,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: spacing.sm,
		backgroundColor: colors.watchedGreen,
	},
	updatingText: {
		...typography.subtitle,
		color: colors.text,
	},
	movieRow: {
		flexDirection: "row",
		alignItems: "stretch",
		marginTop: 2,
	},
	slantArrow: {
		width: 0,
		height: 0,
		alignSelf: "center",
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
	freshTagInline: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.warningAmber,
	},
	latestTagInline: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.accent,
	},
	movieYearRow: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 2,
		gap: spacing.sm,
		paddingHorizontal: spacing.sm,
	},
	movieYearText: {
		...typography.subtitle,
		fontSize: 16,
		fontWeight: "700",
		color: colors.text,
		letterSpacing: 1,
	},
	checkmarkWrap: {
		alignSelf: "center",
	},
});
