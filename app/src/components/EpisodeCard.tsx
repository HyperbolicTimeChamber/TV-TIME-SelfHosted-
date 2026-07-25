import React, { memo, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors, spacing, typography, posterSize } from "../theme";
import { UpcomingEpisode } from "../types";
import SwipeableCard, { SwipeableCardRef } from "./SwipeableCard";
import CheckmarkButton from "./CheckmarkButton";

interface Props {
	episode: UpcomingEpisode;
	isWatched?: boolean;
	onSwipeLeft: () => Promise<void>;
	onSwipeRight: () => Promise<void>;
	onPress: () => void;
	onCheckmark: () => Promise<void>;
}

export default memo(function EpisodeCard({
	episode,
	isWatched,
	onSwipeLeft,
	onSwipeRight,
	onPress,
	onCheckmark: _onCheckmark,
}: Props) {
	const label = `S${String(episode.season).padStart(2, "0")} | E${String(episode.episode).padStart(2, "0")}`;
	const swipeRef = useRef<SwipeableCardRef>(null);

	if (isWatched) {
		return (
			<TouchableOpacity
				style={[styles.container, styles.watchedContainer]}
				onPress={onPress}
				activeOpacity={0.8}
			>
				<Image
					source={{ uri: `${posterSize.small}${episode.posterPath}` }}
					style={[styles.poster, styles.watchedPoster]}
					contentFit="cover"
				/>
				<View style={styles.info}>
					<View style={[styles.titleButton, styles.titleButtonWatched]}>
						<Text style={[styles.titleText, styles.watchedText]} numberOfLines={1}>
							{episode.showTitle.toUpperCase()}
						</Text>
					</View>
					<Text style={[styles.episodeLabel, styles.watchedText]}>{label}</Text>
					<Text style={[styles.episodeTitle, styles.watchedText]} numberOfLines={1}>
						{episode.episodeTitle}
					</Text>
				</View>
				<CheckmarkButton size={36} watched />
			</TouchableOpacity>
		);
	}

	return (
		<SwipeableCard
			ref={swipeRef}
			onSwipeLeft={onSwipeLeft}
			onSwipeRight={onSwipeRight}
			persistAfterSwipe
		>
			<TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.8}>
				<Image
					source={{ uri: `${posterSize.small}${episode.posterPath}` }}
					style={styles.poster}
					contentFit="cover"
				/>
				<View style={styles.info}>
					<View style={styles.titleButton}>
						<Text style={styles.titleText} numberOfLines={1}>
							{episode.showTitle.toUpperCase()}
						</Text>
						<Text style={styles.titleArrow}>›</Text>
					</View>
					<Text style={styles.episodeTitle} numberOfLines={1}>
						{episode.episodeTitle}
					</Text>
					<Text style={styles.episodeLabel}>{label}</Text>
				</View>
				<CheckmarkButton size={36} onPress={() => swipeRef.current?.triggerSwipeLeft()} />
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
	titleButtonWatched: {
		borderColor: colors.textMuted,
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
	episodeLabel: {
		...typography.subtitle,
		fontSize: 16,
		fontWeight: "700",
		color: colors.text,
		letterSpacing: 1,
		marginTop: 2,
	},
	episodeTitle: {
		...typography.body,
		color: colors.text,
		fontSize: 13,
	},
	watchedText: {
		color: colors.textMuted,
	},
});
