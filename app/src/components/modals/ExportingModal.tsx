import React, { type ReactNode } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import AnimatedModal from "./AnimatedModal";
import PanLoader from "../PanLoader";
import { colors, spacing, typography, themedStyles } from "../../theme";

interface Props {
	visible: boolean;
	title?: string;
	/** The line under the title ("Let us cook") */
	hint?: string;
	/** What's being exported, under the hint ("Movies · To be watched") */
	detail?: string;
	/** Shown as a Cancel button (the export stops server-side too) */
	onCancel?: () => void;
	/** Replaces the pan (e.g. the import's PacmanLoader) */
	loader?: ReactNode;
}

/**
 * Blocks the screen while an export / import runs: a pan tossing an egg (web ExportingModal).
 * Can't be dismissed — a tap outside or back does nothing; only Cancel (when given) ends it
 */
export default function ExportingModal({
	visible,
	title = "Preparing your data",
	hint = "Let us cook",
	detail,
	onCancel,
	loader,
}: Readonly<Props>) {
	return (
		<AnimatedModal visible={visible} onClose={() => {}} dismissable={false}>
			<View style={styles.content}>
				<Text style={styles.title}>{title}</Text>
				<Text style={styles.hint}>{hint}</Text>
				{detail ? <Text style={styles.detail}>{detail}</Text> : null}
				{loader ?? <PanLoader />}
				<Text style={styles.note}>This may take a while for big accounts. Keep the app open.</Text>
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
		</AnimatedModal>
	);
}

const styles = themedStyles(() => StyleSheet.create({
	content: {
		backgroundColor: colors.surface,
		borderRadius: 12,
		padding: spacing.lg,
		alignItems: "center",
		overflow: "hidden",
	},
	title: { ...typography.subtitle, fontSize: 16, textAlign: "center", marginBottom: spacing.xs },
	hint: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
	detail: {
		...typography.caption,
		color: colors.textMuted,
		textAlign: "center",
		marginTop: spacing.xs,
	},
	note: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
	cancel: {
		alignSelf: "stretch",
		marginTop: spacing.lg,
		paddingVertical: spacing.md,
		borderRadius: 10,
		backgroundColor: colors.surfaceLight,
		alignItems: "center",
	},
	// Pressed: a touch smaller (Emil: buttons answer the press)
	cancelPressed: { transform: [{ scale: 0.97 }], opacity: 0.85 },
	cancelText: { ...typography.subtitle, fontSize: 15, color: colors.destructiveRed },
}));
