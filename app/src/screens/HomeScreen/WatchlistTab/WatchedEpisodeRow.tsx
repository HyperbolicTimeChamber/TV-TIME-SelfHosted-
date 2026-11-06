import { memo } from "react";
import { similarProps } from "../../../utils/similarProps";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CheckmarkButton, SwipeableCard } from "../../../components";
import { WATCHLIST_CHECK_CIRCLE, WATCHLIST_CHECK_TICK } from "../../../components/CheckmarkButton";
import { withHaptic } from "../../../utils/haptics";
import PosterImage from "../../../components/PosterImage";
import { colors, spacing, typography } from "../../../theme";
import { WatchedEpisode } from "../../../types";
import { EnrichedTrackingItem } from "../../../hooks";

interface Props {
	episode: WatchedEpisode;
	show: EnrichedTrackingItem;
	/** Row body → the episode popup on this row's episode */
	onPress: (episode: WatchedEpisode, show: EnrichedTrackingItem) => void;
	onCheckmarkPress: (episode: WatchedEpisode) => void;
	onSwipeLeft: (episode: WatchedEpisode) => Promise<void>;
	/** `false` = nothing changed (the swipe snaps back). Left out: no Unwatch swipe (a rewatch's
	 *  floor — the watch belongs to an earlier run) */
	onSwipeRight?: (episode: WatchedEpisode) => Promise<boolean | void>;
	/** Long press on the card (haptic included) — omit to turn it off */
	onLongPress?: (show: EnrichedTrackingItem) => void;
}

export default memo(function WatchedEpisodeRow({
	episode,
	show,
	onPress,
	onCheckmarkPress,
	onSwipeLeft,
	onSwipeRight,
	onLongPress,
}: Props) {
	// An unwatch takes the row off (its last watch): no "−1", and the swipe holds its banner
	// until the row goes
	const leaves = episode.watchCount <= 1;
	const label = `S${String(episode.season).padStart(2, "0")} | E${String(episode.episode).padStart(2, "0")}`;

	return (
		<SwipeableCard
			// Recycled list row → fresh swipe state for the new episode
			resetKey={episode.id}
			onSwipeLeft={() => onSwipeLeft(episode)}
			onSwipeRight={onSwipeRight ? () => onSwipeRight(episode) : undefined}
			leftLabel="Rewatch"
			rightLabel="Unwatch"
			rightIcon={leaves ? undefined : "−1"}
			persistAfterSwipe={{ left: true, right: !leaves }}
		>
			<TouchableOpacity
				style={styles.container}
				onPress={() => onPress(episode, show)}
				onLongPress={withHaptic(onLongPress && (() => onLongPress(show)))}
				activeOpacity={0.8}
			>
				<PosterImage posterPath={show.posterPath} mediaType="tv" style={styles.poster} />
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
						size={WATCHLIST_CHECK_CIRCLE}
						checkSize={WATCHLIST_CHECK_TICK}
						watched
						label={episode.watchCount > 1 ? `${episode.watchCount}` : undefined}
						onPress={() => onCheckmarkPress(episode)}
						// Long-press too opens the watch count sheet (not the card's pause)
						onLongPress={() => onCheckmarkPress(episode)}
					/>
				</View>
			</TouchableOpacity>
		</SwipeableCard>
	);
}, similarProps);

const POSTER_WIDTH = 100;

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		backgroundColor: colors.surface,
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
