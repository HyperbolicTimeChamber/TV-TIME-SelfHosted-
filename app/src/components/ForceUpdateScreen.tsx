import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "../theme";
import { UPDATE_URL } from "../enums";

/** Blocking screen for builds below the channel's minimum (see useForceUpdate) */
export default function ForceUpdateScreen() {
	return (
		<View style={styles.container}>
			<View style={styles.iconRing}>
				<Ionicons name="cloud-download-outline" size={44} color={colors.textSecondary} />
			</View>
			<Text style={styles.title}>Update required</Text>
			<Text style={styles.message}>
				This version is no longer supported. Install the latest build to keep watching.
			</Text>
			<TouchableOpacity
				style={styles.button}
				onPress={() => Linking.openURL(UPDATE_URL)}
				activeOpacity={0.8}
			>
				<Text style={styles.buttonText}>Get the update</Text>
			</TouchableOpacity>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xxl,
		backgroundColor: colors.background,
	},
	iconRing: {
		width: 112,
		height: 112,
		borderRadius: 56,
		backgroundColor: colors.surface,
		borderWidth: 1,
		borderColor: colors.border,
		justifyContent: "center",
		alignItems: "center",
		marginBottom: spacing.xl,
	},
	title: { ...typography.title, fontSize: 20, textAlign: "center" },
	message: {
		...typography.body,
		color: colors.textSecondary,
		textAlign: "center",
		lineHeight: 21,
		marginTop: spacing.sm,
		marginBottom: spacing.xl,
	},
	button: {
		alignSelf: "stretch",
		backgroundColor: colors.primary,
		paddingVertical: spacing.md + 2,
		borderRadius: 12,
		alignItems: "center",
	},
	buttonText: { ...typography.subtitle, fontSize: 15 },
});
