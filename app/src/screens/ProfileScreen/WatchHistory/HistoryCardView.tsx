import React, { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import { colors } from "../../../theme";
import { HistoryPill } from "../../../enums";
import { tmdbBlurredBackdropUri, tmdbLogoUri } from "../../../hooks/useTmdbImage";
import type { HistoryCard } from "../../../utils";
import { BLUR_RADIUS } from "../styles";
import ProgressPill from "./ProgressPill";
import WatchCountPill from "../../../components/WatchCountPill";
import StatusPill from "../../../components/StatusPill";
import { CARD_ASPECT, styles } from "./styles";

const CARD_WIDTH = Dimensions.get("window").width - 32;
const CARD_MIN_HEIGHT = CARD_WIDTH / CARD_ASPECT;

/** Status colours at 60% (hex alpha 99) — translucent over the backdrop */
export const PILL_COLOR: Record<HistoryPill, string> = {
	[HistoryPill.WATCHING]: `${colors.stopBlue}99`,
	[HistoryPill.REWATCHING]: `${colors.stopBlue}99`,
	[HistoryPill.COMPLETED]: `${colors.watchedGreen}99`,
	[HistoryPill.PAUSED]: `${colors.destructiveRed}99`,
};

/** Watch History card (16:9): logo + title + status, time spent, progress, Ongoing/Ended */
function HistoryCardView({ card, onPress }: { card: HistoryCard; onPress: () => void }) {
	return (
		<TouchableOpacity
			style={[styles.card, { minHeight: CARD_MIN_HEIGHT }]}
			onPress={onPress}
			activeOpacity={0.85}
		>
			{card.backdropPath && (
				<Image
					source={{ uri: tmdbBlurredBackdropUri(card.backdropPath) }}
					recyclingKey={card.id}
					style={StyleSheet.absoluteFill}
					contentFit="cover"
					// Show the top of the backdrop (faces / titles sit there), like calendar cards
					contentPosition="top"
					blurRadius={BLUR_RADIUS}
				/>
			)}
			<View style={[StyleSheet.absoluteFill, styles.cardOverlay]} />

			<View style={styles.topBlock}>
				<View style={styles.topRow}>
					{/* Logo when TMDB has one (name only as the fallback): 56px tall, width
					    from its shape, never wider than the space left of the corner pill */}
					{card.logoPath ? (
						<Image
							source={{ uri: tmdbLogoUri(card.logoPath, CARD_WIDTH * 0.7) }}
							style={styles.logo}
							contentFit="contain"
							contentPosition="left center"
							accessibilityLabel={card.title}
						/>
					) : (
						<Text style={styles.cardTitle} numberOfLines={2}>
							{card.title}
						</Text>
					)}
					{card.tag && (
						<View style={styles.tagPill}>
							<Text style={styles.tag}>{card.tag}</Text>
						</View>
					)}
				</View>
			</View>

			<View style={styles.bottomRow}>
				{/* Bottom-left: status pill above one slot — progress / up to date / paused,
				    else the watch count */}
				<View style={styles.leftBlock}>
					{card.pill && card.pillLabel && (
						<StatusPill
							label={card.pillLabel}
							color={PILL_COLOR[card.pill]}
							count={card.pillCount}
						/>
					)}
					{card.progress ? (
						<ProgressPill kind={card.progress.kind} percent={card.progress.percent} />
					) : card.watchCount != null ? (
						<WatchCountPill count={card.watchCount} />
					) : null}
				</View>
				{(card.lastWatched || card.timeSpent) && (
					<View style={styles.timeBlock}>
						{card.lastWatched && (
							<>
								<Text style={styles.timeLabel}>Last Watched</Text>
								<Text style={[styles.timeSpent, styles.statGap]}>{card.lastWatched}</Text>
							</>
						)}
						{card.timeSpent && (
							<>
								<Text style={styles.timeLabel}>Total Time Spent</Text>
								<Text style={styles.timeSpent}>{card.timeSpent}</Text>
							</>
						)}
					</View>
				)}
			</View>
		</TouchableOpacity>
	);
}

export default memo(HistoryCardView);
