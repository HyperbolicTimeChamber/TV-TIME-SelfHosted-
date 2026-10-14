import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, typography } from "../../theme";

interface Props {
	directors: string[];
	writers: string[];
	producers: string[];
}

export default function DetailCredits({ directors, writers, producers }: Props) {
	if (directors.length === 0 && writers.length === 0 && producers.length === 0) return null;

	return (
		<View style={styles.creditsSection}>
			{directors.length > 0 && (
				<View style={styles.creditBlock}>
					<Text style={styles.creditLabel}>Director</Text>
					<Text style={styles.creditNames}>{directors.join(", ")}</Text>
				</View>
			)}
			{writers.length > 0 && (
				<View style={styles.creditBlock}>
					<Text style={styles.creditLabel}>Screenplay</Text>
					<Text style={styles.creditNames}>{writers.join(", ")}</Text>
				</View>
			)}
			{producers.length > 0 && (
				<View style={styles.creditBlock}>
					<Text style={styles.creditLabel}>Production</Text>
					<Text style={styles.creditNames}>{producers.join(", ")}</Text>
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	creditsSection: {
		marginTop: spacing.xl,
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.lg,
		paddingHorizontal: spacing.sm,
	},
	creditBlock: {
		minWidth: 100,
	},
	creditLabel: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.primary,
		marginBottom: spacing.xs,
	},
	creditNames: {
		...typography.body,
		color: colors.textSecondary,
	},
});
