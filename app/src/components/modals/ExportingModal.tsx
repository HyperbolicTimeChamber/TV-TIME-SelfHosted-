import React from "react";
import { View, Text, StyleSheet } from "react-native";
import AnimatedModal from "./AnimatedModal";
import PanLoader from "../PanLoader";
import { colors, spacing, typography, themedStyles } from "../../theme";

/** Blocks the screen while exportAccountData runs: a pan tossing an egg (web ExportingModal) */
export default function ExportingModal({ visible }: Readonly<{ visible: boolean }>) {
	return (
		// Can't be dismissed: a second export must not start while one runs
		<AnimatedModal visible={visible} onClose={() => {}} onRequestClose={() => {}}>
			<View style={styles.content}>
				<Text style={styles.title}>Preparing your data</Text>
				<Text style={styles.hint}>Let us cook</Text>
				<PanLoader />
				<Text style={styles.note}>This may take a while for big accounts. Keep the app open.</Text>
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
	note: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
}));
