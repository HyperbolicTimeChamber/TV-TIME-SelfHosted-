import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { colors, spacing, typography } from "../theme";
import { useUiStore } from "../stores";

export default function OfflineOverlay() {
	const isConnected = useUiStore((s) => s.isConnected);

	const handleRetry = async () => {
		const state = await NetInfo.fetch();
		useUiStore.getState().setConnected(state.isConnected ?? false);
	};

	if (isConnected) return null;

	return (
		<Modal transparent animationType="fade" visible>
			<View style={styles.overlay}>
				<Text style={styles.title}>No Internet Connection</Text>
				<Text style={styles.subtitle}>Please check your connection and try again</Text>
				<TouchableOpacity style={styles.button} onPress={handleRetry}>
					<Text style={styles.buttonText}>Retry</Text>
				</TouchableOpacity>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
		backgroundColor: colors.overlay,
		justifyContent: "center",
		alignItems: "center",
		padding: spacing.xl,
	},
	title: {
		...typography.title,
		marginBottom: spacing.sm,
	},
	subtitle: {
		...typography.caption,
		fontSize: 14,
		marginBottom: spacing.xxl,
		textAlign: "center",
	},
	button: {
		backgroundColor: colors.primary,
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.xxl,
		borderRadius: 8,
	},
	buttonText: {
		...typography.subtitle,
		color: colors.text,
	},
});
