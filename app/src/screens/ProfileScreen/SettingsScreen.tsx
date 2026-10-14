import React, { useState, useCallback } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	ScrollView,
	StyleSheet,
	Alert,
	ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { getAuth, sendPasswordResetEmail } from "@react-native-firebase/auth";
import { useAuthStore } from "../../stores";
import { colors, spacing, typography } from "../../theme";
import { CircleBackButton, CIRCLE_BUTTON_SIZE } from "../../components/CircleButton";
import { ProfileStackParamList, Route } from "../../types";

export default function SettingsScreen() {
	const { top } = useSafeAreaInsets();
	const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
	const hasCompletedImport = useAuthStore((s) => s.hasCompletedImport);
	const user = useAuthStore((s) => s.user);
	const signOut = useAuthStore((s) => s.signOut);
	const [testingFCM, setTestingFCM] = useState(false);
	const [deletingAccount, setDeletingAccount] = useState(false);

	const isEmailUser = user?.providerData?.some((p) => p.providerId === "password") ?? false;

	const handleChangePassword = useCallback(async () => {
		const email = user?.email;
		if (!email) return;
		try {
			await sendPasswordResetEmail(getAuth(), email);
			Alert.alert("Reset Email Sent", "Check your inbox for a password reset link.");
		} catch {
			Alert.alert("Error", "Failed to send reset email. Try again later.");
		}
	}, [user?.email]);

	const handleTestFCM = useCallback(async () => {
		if (testingFCM) return;
		setTestingFCM(true);
		try {
			const functions = getFunctions();
			await httpsCallable(functions, "testFCM")({});
			Alert.alert("Success", "Test notification sent!");
		} catch (err: any) {
			Alert.alert("Error", err.message || "Failed to send test notification.");
		} finally {
			setTestingFCM(false);
		}
	}, [testingFCM]);

	const handleDeleteAccount = useCallback(() => {
		Alert.alert(
			"Delete Account",
			"This will permanently delete your account and all data. This cannot be undone.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: async () => {
						setDeletingAccount(true);
						try {
							const functions = getFunctions();
							await httpsCallable(functions, "deleteAccount")({});
							await signOut();
						} catch (err: any) {
							Alert.alert("Error", err.message || "Failed to delete account.");
							setDeletingAccount(false);
						}
					},
				},
			],
		);
	}, [signOut]);

	return (
		<ScrollView style={[styles.container, { paddingTop: top }]}>
			<View style={styles.headerRow}>
				<CircleBackButton onPress={() => navigation.goBack()} />
				<Text style={styles.headerTitle}>Settings</Text>
				<View style={styles.headerSpacer} />
			</View>
			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Data</Text>
				<TouchableOpacity style={styles.row} onPress={() => navigation.navigate(Route.IMPORT_DATA)}>
					<Text style={styles.rowText}>
						{hasCompletedImport ? "Re-sync TV Time Data" : "Import TV Time Data"}
					</Text>
				</TouchableOpacity>
			</View>

			{__DEV__ && (
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Debug</Text>
					<TouchableOpacity style={styles.row} onPress={handleTestFCM} disabled={testingFCM}>
						{testingFCM ? (
							<ActivityIndicator size="small" color={colors.accent} />
						) : (
							<Text style={styles.rowText}>Send Test Notification</Text>
						)}
					</TouchableOpacity>
				</View>
			)}

			<View style={styles.section}>
				<Text style={styles.sectionTitle}>Account</Text>
				{isEmailUser && (
					<TouchableOpacity style={styles.row} onPress={handleChangePassword}>
						<Text style={styles.rowText}>Change Password</Text>
					</TouchableOpacity>
				)}
				<TouchableOpacity
					style={styles.row}
					onPress={handleDeleteAccount}
					disabled={deletingAccount}
				>
					{deletingAccount ? (
						<ActivityIndicator size="small" color={colors.destructiveRed} />
					) : (
						<Text style={styles.deleteText}>Delete Account & Data</Text>
					)}
				</TouchableOpacity>
			</View>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.sm,
	},
	headerSpacer: { width: CIRCLE_BUTTON_SIZE },
	headerTitle: {
		...typography.title,
		flex: 1,
		textAlign: "center",
		fontSize: 18,
	},
	section: {
		marginTop: spacing.lg,
		marginHorizontal: spacing.lg,
		backgroundColor: colors.surface,
		borderRadius: 8,
		overflow: "hidden",
	},
	sectionTitle: {
		...typography.caption,
		color: colors.textMuted,
		paddingHorizontal: spacing.md,
		paddingTop: spacing.md,
		paddingBottom: spacing.xs,
	},
	row: {
		paddingVertical: spacing.lg,
		paddingHorizontal: spacing.md,
		borderTopWidth: 1,
		borderTopColor: colors.border,
	},
	rowText: {
		...typography.subtitle,
		fontSize: 15,
		color: colors.accent,
	},
	deleteText: {
		...typography.subtitle,
		fontSize: 15,
		color: colors.destructiveRed,
	},
});
