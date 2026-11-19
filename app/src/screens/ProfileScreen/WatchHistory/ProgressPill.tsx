import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, themedStyles } from "../../../theme";
import { HistoryProgress } from "../../../enums";
import ProgressRing from "./ProgressRing";
import { RING_SIZE } from "./styles";
import { HiCheck } from "../../../components/HiIcons";

interface Props {
	kind: HistoryProgress;
	/** PERCENT: 0–100 */
	percent?: number;
	/** The smaller size on a list card's tag line (Watch History's cards use the full size) */
	compact?: boolean;
}

/** The icon / ring box inside the compact pill */
const COMPACT_ICON = 16;

/**
 * The progress pill — a percent ring, Up To Date or Paused — that Watch History's cards and a
 * list card's tag line both show. The icon / ring sits concentric with the rounded left end: the
 * left padding equals the vertical padding.
 */
export default function ProgressPill({ kind, percent = 0, compact = false }: Readonly<Props>) {
	const size = compact ? compactStyles : fullStyles;
	if (kind === HistoryProgress.PERCENT) {
		return (
			<View style={[styles.pill, size.pill, { backgroundColor: colors.warningAmber }]}>
				{/* ProgressRing is RING_SIZE wide: scaled down to the compact pill */}
				<View style={compact ? styles.compactRing : undefined}>
					<ProgressRing percent={percent} />
				</View>
				<Text style={[styles.text, size.text, { color: colors.onAmber }]}>{percent}%</Text>
			</View>
		);
	}
	const upToDate = kind === HistoryProgress.UP_TO_DATE;
	return (
		<View
			style={[
				styles.pill,
				size.pill,
				{ backgroundColor: upToDate ? colors.watchedGreen : colors.moviePurple },
			]}
		>
			{/* Ionicons glyphs carry ~1px inner padding: +2 / −1 margin → visually the ring's size */}
			{upToDate ? (
				<HiCheck size={compact ? COMPACT_ICON : RING_SIZE} color={colors.onImage} />
			) : (
				<Ionicons
					name="pause-circle-outline"
					size={(compact ? COMPACT_ICON : RING_SIZE) + 2}
					color={colors.onImage}
					style={styles.icon}
				/>
			)}
			<Text style={[styles.text, size.text]}>{upToDate ? "Up To Date" : "Paused"}</Text>
		</View>
	);
}

const styles = themedStyles(() => StyleSheet.create({
	pill: { flexDirection: "row", alignItems: "center", borderRadius: 999 },
	text: { color: colors.onImage, fontWeight: "700", includeFontPadding: false },
	icon: { margin: -1 },
	// Scaled box: layout stays COMPACT_ICON wide, the 20px ring draws inside it shrunk to fit
	compactRing: {
		width: COMPACT_ICON,
		height: COMPACT_ICON,
		alignItems: "center",
		justifyContent: "center",
		transform: [{ scale: COMPACT_ICON / RING_SIZE }],
	},
}));

const fullStyles = themedStyles(() => StyleSheet.create({
	pill: { gap: 6, paddingLeft: 5, paddingRight: 10, paddingVertical: 5 },
	text: { fontSize: 14, lineHeight: 18 },
}));

const compactStyles = themedStyles(() => StyleSheet.create({
	// 26 tall (the 16 icon + 5 + 5): the icon sits concentric with the rounded left end
	pill: { gap: 4, paddingLeft: 5, paddingRight: 8, paddingVertical: 5 },
	text: { fontSize: 11, lineHeight: 16 },
}));
