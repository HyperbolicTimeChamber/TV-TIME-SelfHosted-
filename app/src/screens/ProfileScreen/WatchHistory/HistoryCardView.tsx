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
import { RING_SIZE, styles } from "./styles";

const CARD_WIDTH = Dimensions.get("window").width - 32;

/** Status colours at 60% (hex alpha 99) — translucent over the backdrop */
export const PILL_COLOR: Record<HistoryPill, string> = {
	[HistoryPill.WATCHING]: `${colors.stopBlue}99`,
	[HistoryPill.REWATCHING]: `${colors.stopBlue}99`,
	[HistoryPill.COMPLETED]: `${colors.watchedGreen}99`,
	[HistoryPill.PAUSED]: `${colors.moviePurple}99`,
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
				{/* Ionicons glyphs carry ~1px inner padding: +2 / −1 margin → visually RING_SIZE */}
				<Ionicons
					name={upToDate ? "checkmark-circle-outline" : "pause-circle-outline"}
					size={RING_SIZE + 2}
					color={colors.text}
					style={styles.progressIcon}
				/>
				<Text style={[styles.progressText, { color: colors.text }]}>
					{upToDate ? "Up To Date" : "Paused"}
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
				{card.progress ? <ProgressModule progress={card.progress} /> : <View />}
				<View style={styles.timeBlock}>
					<Text style={styles.timeSpent}>{card.timeSpent}</Text>
					{card.watchCount != null && (
						<View style={[styles.tagPill, styles.watchCountPill]}>
							<Text style={styles.tag}>Watch Count</Text>
							<View style={styles.countCircle}>
								<Text style={styles.tag}>{card.watchCount}</Text>
							</View>
						</View>
					)}
				</View>
			</View>
		</TouchableOpacity>
	);
}

export default memo(HistoryCardView);
