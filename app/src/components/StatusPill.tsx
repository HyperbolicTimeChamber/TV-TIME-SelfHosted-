import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme";

interface Props {
	label: string;
	color: string;
	/** Rewatch run: a white circle on the pill's right end */
	count?: number | null;
	/** The smaller size on a list card's tag line (Watch History's cards use the full size) */
	compact?: boolean;
}

/**
 * The status pill (Currently Watching / Rewatching / Completed) Watch History's cards and a list
 * card's tag line both show. With a count, the circle sits concentric with the rounded end: the
 * right padding equals the vertical padding.
 */
export default function StatusPill({ label, color, count, compact = false }: Readonly<Props>) {
	const size = compact ? compactStyles : fullStyles;
	const withCount = count != null;
	return (
		<View
			style={[
				styles.pill,
				size.pill,
				withCount && styles.withCount,
				withCount && size.withCount,
				{ backgroundColor: color },
			]}
		>
			<Text style={[styles.text, size.text]}>{label}</Text>
			{withCount && (
				<View style={[styles.circle, size.circle]}>
					<Text style={[styles.countText, size.countText]}>{count}</Text>
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	pill: { borderRadius: 999 },
	withCount: { flexDirection: "row", alignItems: "center" },
	// No extra font padding: Android adds it above the digits, which pushed the count off-centre
	text: { color: colors.text, fontWeight: "700", includeFontPadding: false },
	circle: { backgroundColor: colors.text, alignItems: "center", justifyContent: "center" },
	countText: { color: colors.surface, fontWeight: "700", includeFontPadding: false },
});

const fullStyles = StyleSheet.create({
	pill: { paddingHorizontal: 12, paddingVertical: 5 },
	withCount: { gap: 6, paddingVertical: 4, paddingRight: 4 },
	text: { fontSize: 13, lineHeight: 17 },
	circle: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5 },
	countText: { fontSize: 12, lineHeight: 16 },
});

const compactStyles = StyleSheet.create({
	pill: { paddingHorizontal: 8, paddingVertical: 3 },
	withCount: { gap: 4, paddingVertical: 3, paddingRight: 3 },
	text: { fontSize: 11, lineHeight: 14 },
	circle: { minWidth: 14, height: 14, borderRadius: 7, paddingHorizontal: 3 },
	countText: { fontSize: 10, lineHeight: 13 },
});
