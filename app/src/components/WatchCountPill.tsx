import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme";

interface Props {
	count: number;
	label?: string;
	/** The smaller size on a list card's tag line (Watch History's cards use the full size) */
	compact?: boolean;
}

/**
 * "Watch Count" + the count in a lighter grey circle on the pill's right end — the one pill Watch
 * History's cards and a list card's tag line both show. The right padding equals the vertical
 * padding, so the circle sits concentric with the rounded end.
 */
export default function WatchCountPill({
	count,
	label = "Watch Count",
	compact = false,
}: Readonly<Props>) {
	const size = compact ? compactStyles : fullStyles;
	return (
		<View style={[styles.pill, size.pill]}>
			<Text style={[styles.text, size.text]}>{label}</Text>
			<View style={[styles.circle, size.circle]}>
				<Text style={[styles.text, size.text]}>{count}</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	pill: {
		flexDirection: "row",
		alignItems: "center",
		borderRadius: 999,
		// textSecondary at 35% — translucent over the backdrop
		backgroundColor: `${colors.textSecondary}59`,
	},
	// No extra font padding: Android adds it above the digits, which pushed the count off-centre
	text: { color: colors.text, fontWeight: "700", includeFontPadding: false },
	circle: {
		alignItems: "center",
		justifyContent: "center",
		// Lighter grey than the pill (textSecondary 70% vs 35%)
		backgroundColor: `${colors.textSecondary}B3`,
	},
});

const fullStyles = StyleSheet.create({
	pill: { gap: 6, paddingLeft: 10, paddingRight: 5, paddingVertical: 5 },
	text: { fontSize: 14, lineHeight: 18 },
	circle: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6 },
});

const compactStyles = StyleSheet.create({
	// 26 tall (the 18 circle + 4 + 4), like the other tags on the line
	pill: { gap: 4, paddingLeft: 8, paddingRight: 4, paddingVertical: 4 },
	text: { fontSize: 11, lineHeight: 16 },
	circle: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4 },
});
