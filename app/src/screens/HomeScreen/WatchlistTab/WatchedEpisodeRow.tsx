import { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { CheckmarkButton, SwipeableCard } from "../../../components";
import { colors, spacing, typography, posterSize } from "../../../theme";
import { WatchedEpisode } from "../../../types";
import { EnrichedTrackingItem } from "../../../hooks";

interface Props {
	episode: WatchedEpisode;
	show: EnrichedTrackingItem;
	onPress: (tmdbShowId: number) => void;
	onCheckmarkPress: (episode: WatchedEpisode) => void;
	onSwipeLeft: (episode: WatchedEpisode) => Promise<void>;
	onSwipeRight: (episode: WatchedEpisode) => Promise<void>;
}

export default memo(function WatchedEpisodeRow({
	episode,
	show,
	onPress,
	onCheckmarkPress,
	onSwipeLeft,
	onSwipeRight,
}: Props) {
	const label = `S${String(episode.season).padStart(2, "0")} | E${String(episode.episode).padStart(2, "0")}`;

	return (
		<SwipeableCard
			onSwipeLeft={() => onSwipeLeft(episode)}
			onSwipeRight={() => onSwipeRight(episode)}
			leftLabel="Rewatch"
			rightLabel={episode.watchCount > 1 ? "−1" : "Unwatch"}
			persistAfterSwipe={{ left: true, right: episode.watchCount > 1 }}
		>
			<TouchableOpacity
				style={[styles.container, styles.watchedContainer]}
				onPress={() => onPress(episode.tmdbShowId)}
				activeOpacity={0.8}
			>
				<Image
					source={{ uri: `${posterSize.small}${show.posterPath}` }}
					style={[styles.poster, styles.watchedPoster]}
					contentFit="cover"
				/>
				<View style={styles.info}>
					<View style={styles.titleButton}>
						<Text style={styles.titleText} numberOfLines={1}>
							{show.title.toUpperCase()}
						</Text>
					</View>
					<Text style={styles.episodeLabel}>{label}</Text>
					<Text style={styles.episodeTitle} numberOfLines={1}>
						{episode.episodeTitle}
					</Text>
				</View>
				<CheckmarkButton
					size={36}
					watched
					label={episode.watchCount > 1 ? `${episode.watchCount}` : undefined}
					onPress={() => onCheckmarkPress(episode)}
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
	},
	titleButton: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		borderWidth: 1.5,
		borderColor: colors.textMuted,
		borderRadius: 14,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		marginBottom: spacing.sm,
	},
	titleText: {
		fontSize: 11,
		fontWeight: "600",
		color: colors.textMuted,
		flexShrink: 1,
		letterSpacing: 0.5,
	},
	episodeLabel: {
		...typography.subtitle,
		fontSize: 16,
		fontWeight: "700",
		color: colors.textMuted,
		letterSpacing: 1,
		marginTop: 2,
	},
	episodeTitle: {
		...typography.body,
		color: colors.textMuted,
		fontSize: 13,
	},
});
