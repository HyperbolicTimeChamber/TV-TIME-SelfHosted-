import { memo } from "react";
import { similarProps } from "../../../utils/similarProps";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CheckmarkButton, SwipeableCard } from "../../../components";
import { WATCHLIST_CHECK_CIRCLE, WATCHLIST_CHECK_TICK } from "../../../components/CheckmarkButton";
import { withHaptic } from "../../../utils/haptics";
import PosterImage from "../../../components/PosterImage";
import { colors, spacing } from "../../../theme";
import CardInfo, { cardStyles } from "../../../components/CardInfo";
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
	// An unwatch takes the row off (its last watch): no "−1". The swipe holds its banner until
	// the row goes or shows its new count — a rewatch's row going back to its first watch leaves
	// its slot too, and the row coming back for a moment before it went read as an undo
	const leaves = episode.watchCount <= 1;
	const label = `S${String(episode.season).padStart(2, "0")} | E${String(episode.episode).padStart(2, "0")}`;

	return (
		<SwipeableCard
			// Recycled list row → fresh swipe state for the new episode
			resetKey={episode.id}
			contentKey={String(episode.watchCount)}
			onSwipeLeft={() => onSwipeLeft(episode)}
			onSwipeRight={onSwipeRight ? () => onSwipeRight(episode) : undefined}
			leftLabel="Rewatch"
			rightLabel="Unwatch"
			rightIcon={leaves ? undefined : "−1"}
			persistAfterSwipe={{ left: true, right: false }}
		>
			<TouchableOpacity
				style={[cardStyles.container, styles.container]}
				onPress={() => onPress(episode, show)}
				onLongPress={withHaptic(onLongPress && (() => onLongPress(show)))}
				activeOpacity={0.8}
			>
				<PosterImage posterPath={show.posterPath} mediaType="tv" style={[cardStyles.poster, styles.poster]} />
				<CardInfo
					title={show.title}
					titlePillStyle={styles.mutedPill}
					titleTextStyle={styles.muted}
					subline={episode.episodeTitle}
					sublineLines={2}
					sublineStyle={styles.muted}
				>
					<Text style={[cardStyles.episode, styles.muted]}>{label}</Text>
				</CardInfo>
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

// Previously Watched: the whole card at half strength, the poster dimmer still
const styles = StyleSheet.create({
	container: { opacity: 0.5 },
	poster: { opacity: 0.6 },
	mutedPill: { borderColor: colors.textMuted },
	muted: { color: colors.textMuted },
	checkmarkWrap: {
		alignSelf: "center",
		paddingRight: spacing.md,
	},
});
