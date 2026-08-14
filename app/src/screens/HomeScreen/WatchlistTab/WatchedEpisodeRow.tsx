import { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CheckmarkButton, SwipeableCard } from "../../../components";
import PosterImage from "../../../components/PosterImage";
import { colors, spacing, typography } from "../../../theme";
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
				style={styles.container}
				onPress={() => onPress(episode.tmdbShowId)}
				activeOpacity={0.8}
			>
				<PosterImage posterPath={show.posterPath} mediaType="tv" size="medium" style={styles.poster} />
				<View style={styles.info}>
					<View style={styles.titlePill}>
						<Text style={styles.titleText} numberOfLines={1}>
							{show.title.toUpperCase()}
						</Text>
					</View>
					<Text style={styles.episodeLabel}>{label}</Text>
					{episode.episodeTitle ? (
						<Text style={styles.episodeTitle} numberOfLines={1}>
							{episode.episodeTitle}
						</Text>
					) : null}
				</View>
				<View style={styles.checkmarkWrap}>
					<CheckmarkButton
						size={38}
						watched
						label={episode.watchCount > 1 ? `${episode.watchCount}` : undefined}
						onPress={() => onCheckmarkPress(episode)}
					/>
				</View>
			</TouchableOpacity>
		</SwipeableCard>
	);
});

const POSTER_WIDTH = 100;

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		backgroundColor: colors.background,
		borderRadius: 8,
		overflow: "hidden",
		opacity: 0.5,
		minHeight: POSTER_WIDTH,
	},
	poster: {
		width: POSTER_WIDTH,
		alignSelf: "stretch",
		opacity: 0.6,
	},
	info: {
		flex: 1,
		justifyContent: "center",
		paddingVertical: spacing.sm,
		paddingLeft: spacing.md,
		paddingRight: spacing.xs,
	},
	titlePill: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		borderWidth: 1.5,
		borderColor: colors.textMuted,
		borderRadius: 14,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		marginBottom: spacing.sm,
		maxWidth: "90%",
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
	},
	episodeTitle: {
		...typography.body,
		color: colors.textMuted,
		fontSize: 13,
		marginTop: 2,
	},
	checkmarkWrap: {
		alignSelf: "center",
		paddingRight: spacing.md,
	},
});
