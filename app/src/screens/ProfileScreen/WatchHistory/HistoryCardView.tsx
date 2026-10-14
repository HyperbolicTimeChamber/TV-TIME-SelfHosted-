import React, { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../../theme";
import { HistoryPill, HistoryProgress } from "../../../enums";
import { tmdbBackdropUri, tmdbLogoUri } from "../../../hooks/useTmdbImage";
import type { HistoryCard } from "../../../utils";
import { BLUR_RADIUS } from "../styles";
import ProgressRing from "./ProgressRing";
import { styles } from "./styles";

const CARD_WIDTH = Dimensions.get("window").width - 32;

export const PILL_COLOR: Record<HistoryPill, string> = {
	[HistoryPill.WATCHING]: colors.watchedGreen,
	[HistoryPill.REWATCHING]: colors.stopBlue,
	[HistoryPill.COMPLETED]: colors.destructiveRed,
	[HistoryPill.PAUSED]: colors.moviePurple,
};

function ProgressModule({ progress }: { progress: NonNullable<HistoryCard["progress"]> }) {
	if (progress.kind === HistoryProgress.UP_TO_DATE || progress.kind === HistoryProgress.PAUSED) {
		const upToDate = progress.kind === HistoryProgress.UP_TO_DATE;
		return (
			<View
				style={[
					styles.progressPill,
					{ backgroundColor: upToDate ? colors.watchedGreen : colors.moviePurple },
				]}
			>
				<Ionicons
					name={upToDate ? "checkmark-circle-outline" : "pause-circle-outline"}
					size={18}
					color={colors.text}
				/>
				<Text style={[styles.progressText, { color: colors.text }]}>
					{upToDate ? "Up to date" : "Paused"}
				</Text>
			</View>
		);
	}
	return (
		<View style={[styles.progressPill, { backgroundColor: colors.warningAmber }]}>
			<ProgressRing percent={progress.percent ?? 0} />
			<Text style={[styles.progressText, { color: colors.surface }]}>{progress.percent ?? 0}%</Text>
		</View>
	);
}

/** Watch History card (16:9): logo + title + status, time spent, progress, Ongoing/Ended */
function HistoryCardView({ card, onPress }: { card: HistoryCard; onPress: () => void }) {
	return (
		<TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
			{card.backdropPath && (
				<Image
					source={{ uri: tmdbBackdropUri(card.backdropPath, CARD_WIDTH) }}
					style={StyleSheet.absoluteFill}
					contentFit="cover"
					blurRadius={BLUR_RADIUS}
				/>
			)}
			<View style={[StyleSheet.absoluteFill, styles.cardOverlay]} />

			<View style={styles.topBlock}>
				<View style={styles.topRow}>
					{card.logoPath ? (
						<Image
							source={{ uri: tmdbLogoUri(card.logoPath, CARD_WIDTH * 0.34) }}
							style={styles.logo}
							contentFit="contain"
							contentPosition="left center"
						/>
					) : (
						<View />
					)}
					{card.pill && (
						<View style={[styles.pill, { backgroundColor: PILL_COLOR[card.pill] }]}>
							<Text style={styles.pillText}>{card.pill}</Text>
						</View>
					)}
				</View>
				<Text style={styles.cardTitle} numberOfLines={1}>
					{card.title}
				</Text>
				{card.tag && (
					<View style={styles.tagPill}>
						<Text style={styles.tag}>{card.tag}</Text>
					</View>
				)}
			</View>

			<View style={styles.bottomRow}>
				<View>
					<Text style={styles.timeSpent}>{card.timeSpent}</Text>
					{card.watchCount != null && (
						<Text style={styles.watchCount}>Watched {card.watchCount}×</Text>
					)}
				</View>
				{card.progress && <ProgressModule progress={card.progress} />}
			</View>
		</TouchableOpacity>
	);
}

export default memo(HistoryCardView);
