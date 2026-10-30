import React from "react";
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { colors, spacing, typography } from "../theme";

/** Pill + circle height: compact, so it reads as a tag next to 44px buttons, not a button */
export const WATCH_COUNT_PILL_HEIGHT = 32;
const CIRCLE = 24;

interface Props {
	count: number;
	/** Fill / position from the caller (detail page: overlay over art; sheet: raised surface) */
	style?: StyleProp<ViewStyle>;
}

/** "Watched (n)" — the number in a white circle */
export default function WatchCountPill({ count, style }: Readonly<Props>) {
	return (
		<View
			style={[styles.pill, style]}
			accessible
			accessibilityLabel={`Watched ${count} ${count === 1 ? "time" : "times"}`}
		>
			<Text style={styles.label}>Watched</Text>
			<View style={styles.circle}>
				<Text style={styles.number}>{count}</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	pill: {
		height: WATCH_COUNT_PILL_HEIGHT,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		paddingLeft: spacing.md,
		paddingRight: (WATCH_COUNT_PILL_HEIGHT - CIRCLE) / 2,
		borderRadius: WATCH_COUNT_PILL_HEIGHT / 2,
		backgroundColor: colors.badgeOverlay,
	},
	label: {
		...typography.subtitle,
		fontSize: 13,
		color: colors.text,
	},
	circle: {
		minWidth: CIRCLE,
		height: CIRCLE,
		paddingHorizontal: 5,
		borderRadius: CIRCLE / 2,
		backgroundColor: colors.text,
		alignItems: "center",
		justifyContent: "center",
	},
	number: {
		...typography.subtitle,
		fontSize: 13,
		fontWeight: "700",
		color: colors.background,
		fontVariant: ["tabular-nums"],
	},
});
