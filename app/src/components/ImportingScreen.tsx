import React, { type ReactNode } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PoweredByTmdb from "./PoweredByTmdb";
import { colors, spacing, typography } from "../theme";

interface Props {
	title: string;
	/** Under the title (e.g. "Om nom nom") */
	hint?: string;
	loader: ReactNode;
	/** Paragraphs under the loader */
	lines: string[];
	/** Shown as a Cancel button */
	onCancel?: () => void;
}

/**
 * The full screen an import holds the app on: TV Time import / re-sync (spinner) and Settings →
 * Import Data (Pac-Man). The TMDB credit sits at the bottom, as on Settings.
 */
export default function ImportingScreen({ title, hint, loader, lines, onCancel }: Readonly<Props>) {
	const { top, bottom } = useSafeAreaInsets();
	return (
		<View style={[styles.screen, { paddingTop: top, paddingBottom: bottom + spacing.lg }]}>
			<View style={styles.body}>
				<Text style={styles.title}>{title}</Text>
				{hint ? <Text style={styles.hint}>{hint}</Text> : null}
				<View style={styles.loader}>{loader}</View>
				{lines.map((line) => (
					<Text key={line} style={styles.desc}>
						{line}
					</Text>
				))}
				{onCancel && (
					<Pressable
						onPress={onCancel}
						accessibilityRole="button"
						style={({ pressed }) => [styles.cancel, pressed && styles.cancelPressed]}
					>
						<Text style={styles.cancelText}>Cancel</Text>
					</Pressable>
				)}
			</View>
			<PoweredByTmdb />
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
	body: { flex: 1, justifyContent: "center", alignItems: "center" },
	title: { ...typography.title, textAlign: "center", marginBottom: spacing.xs },
	hint: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
	loader: { marginVertical: spacing.lg },
	desc: {
		...typography.body,
		color: colors.textSecondary,
		textAlign: "center",
		marginTop: spacing.sm,
	},
	cancel: {
		marginTop: spacing.xl,
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.xxl,
		borderRadius: 12,
		backgroundColor: colors.surfaceLight,
	},
	// Pressed: a touch smaller (Emil: buttons answer the press)
	cancelPressed: { transform: [{ scale: 0.97 }], opacity: 0.85 },
	cancelText: { ...typography.subtitle, fontSize: 15, color: colors.destructiveRed },
});
