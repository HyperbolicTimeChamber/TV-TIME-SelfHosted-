import React, { memo, useRef, useCallback } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	StyleSheet,
	ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { MediaType } from "../types";
import { colors, spacing, typography, posterSize } from "../theme";
import SwipeableCard, { SwipeableCardRef } from "./SwipeableCard";
import CheckmarkButton from "./CheckmarkButton";
import SkeletonLine from "./SkeletonLine";

const FRESH_TAG = {
	NEW: "NEW",
	JUST_AIRED: "JUST AIRED",
} as const;

const JUST_AIRED_WINDOW_DAYS = 7;

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
	releaseDate?: string | null;
}

interface Props {
	item: ShowCardItem;
	isWatched?: boolean;
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
	isUpdating,
	remainingEpisodes,
	onSwipeLeft,
	onSwipeRight,
	onPress,
	onTitlePress,
	onCheckmark,
	onCheckmarkLongPress,
}: Props) {
	const ep =
		item.nextEpisode ??
		(item.mediaType === MediaType.TV ? { season: 1, episode: 1 } : null);
	const episodeLabel = ep
		? `S${String(ep.season).padStart(2, "0")} | E${String(ep.episode).padStart(2, "0")}`
		: "Movie";

	const remainingLabel =
		remainingEpisodes != null && remainingEpisodes > 0
			? `+${remainingEpisodes} ep${remainingEpisodes > 1 ? "s" : ""} left`
			: null;

	const today = new Date().toISOString().split("T")[0];

	// "NEW" tag: TV episode aired today
	const isNewEpisode =
		item.mediaType === MediaType.TV &&
		item.nextEpisodeAirDate &&
		item.nextEpisodeAirDate === today;

	// "JUST AIRED" tag: movie released within last 7 days
	const isJustAired = (() => {
		if (item.mediaType !== MediaType.MOVIE || !item.releaseDate) return false;
		const releaseMs = new Date(item.releaseDate).getTime();
		const todayMs = new Date(today).getTime();
		const sevenDaysMs = JUST_AIRED_WINDOW_DAYS * 24 * 60 * 60 * 1000;
		return releaseMs <= todayMs && todayMs - releaseMs <= sevenDaysMs;
	})();

	const swipeRef = useRef<SwipeableCardRef>(null);

	const handlePress = useCallback(() => {
		if (item.mediaType === MediaType.MOVIE && onTitlePress) {
			onTitlePress(item);
		} else {
			onPress(item.tmdbId, item.mediaType);
		}
	}, [onPress, onTitlePress, item]);
	const handleTitlePress = useCallback(
		() => onTitlePress?.(item),
		[onTitlePress, item],
	);
	const handleSwipeLeft = useCallback(
		() => onSwipeLeft(item),
		[onSwipeLeft, item],
	);
	const handleSwipeRight = useCallback(
		() => onSwipeRight(item),
		[onSwipeRight, item],
	);

	if (isWatched) {
		return (
			<TouchableOpacity
				style={[styles.container, styles.watchedContainer]}
				onPress={handlePress}
				activeOpacity={0.8}>
				<Image
					source={{ uri: `${posterSize.small}${item.posterPath}` }}
					style={[styles.poster, styles.watchedPoster]}
					contentFit="cover"
				/>
				<View style={styles.info}>
					<Text
						style={[styles.watchedTitle, styles.watchedText]}
						numberOfLines={1}>
						{item.title}
					</Text>
					{item.mediaType === MediaType.MOVIE ? (
						<View style={[styles.movieBadge, { opacity: 0.6 }]}>
							<Text style={styles.movieBadgeText}>MOVIE</Text>
						</View>
					) : (
						<Text style={[styles.episode, styles.watchedText]}>
							{episodeLabel}
						</Text>
					)}
					{item.rewatchCount > 0 && (
						<Text style={[styles.rewatch, styles.watchedText]}>
							Rewatch #{item.rewatchCount}
						</Text>
					)}
				</View>
				<CheckmarkButton size={36} watched />
			</TouchableOpacity>
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
			persistAfterSwipe>
			<TouchableOpacity
				style={styles.container}
				onPress={handlePress}
				activeOpacity={0.8}>
				<Image
					source={{ uri: `${posterSize.small}${item.posterPath}` }}
					style={styles.poster}
					contentFit="cover"
				/>
				<View style={styles.info}>
					<TouchableOpacity
						style={styles.titleButton}
						onPress={handleTitlePress}
						disabled={!onTitlePress}>
						<Text style={styles.titleText} numberOfLines={1}>
							{item.title.toUpperCase()}
						</Text>
						{onTitlePress && <Text style={styles.titleArrow}>›</Text>}
					</TouchableOpacity>
					{item.nextEpisodeName ? (
						<Text style={styles.episodeName} numberOfLines={1}>
							{item.nextEpisodeName}
						</Text>
					) : item.mediaType === MediaType.TV ? (
						<SkeletonLine width="55%" height={11} />
					) : null}
					{item.mediaType === MediaType.MOVIE ? (
						<View style={styles.movieRow}>
							<View style={styles.movieBadge}>
								<Text style={styles.movieBadgeText}>MOVIE</Text>
							</View>
							{isJustAired && (
								<View style={styles.freshTag}>
									<Text style={styles.freshTagText}>{FRESH_TAG.JUST_AIRED}</Text>
								</View>
							)}
						</View>
					) : (
						<Text style={styles.episode}>
							{episodeLabel}
							{remainingLabel ? (
								<Text style={styles.remaining}> {remainingLabel}</Text>
							) : null}
							{isNewEpisode && (
								<Text style={styles.freshTagInline}> {FRESH_TAG.NEW}</Text>
							)}
						</Text>
					)}
					{item.rewatchCount > 0 && (
						<Text style={styles.rewatch}>Rewatch #{item.rewatchCount}</Text>
					)}
				</View>
				<CheckmarkButton
					size={36}
					onPress={() => swipeRef.current?.triggerSwipeLeft()}
					onLongPress={onCheckmarkLongPress}
				/>
			</TouchableOpacity>
		</SwipeableCard>
	);
});

const styles = StyleSheet.create({
	container: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
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
	},
	episodeName: {
		...typography.body,
		color: colors.text,
		marginTop: 2,
		fontSize: 13,
	},
	movieBadge: {
		alignSelf: "flex-start",
		backgroundColor: colors.moviePurple,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		borderRadius: 4,
		marginTop: 2,
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
		alignItems: "center",
		gap: spacing.sm,
		marginTop: 2,
	},
	freshTag: {
		backgroundColor: colors.warningAmber,
		paddingHorizontal: spacing.sm,
		paddingVertical: 1,
		borderRadius: 4,
	},
	freshTagText: {
		fontSize: 9,
		fontWeight: "700",
		color: "#1A1A1A",
		letterSpacing: 0.5,
	},
	freshTagInline: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.warningAmber,
	},
});
