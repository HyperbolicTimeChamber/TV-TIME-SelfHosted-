import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Switch, TouchableOpacity, AppState, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Notifications from "expo-notifications";
import * as Battery from "expo-battery";
import * as IntentLauncher from "expo-intent-launcher";
import { colors, spacing, typography, themedStyles } from "../../theme";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import { CircleBackButton, CIRCLE_BUTTON_SIZE } from "../../components/CircleButton";
import { ProfileStackParamList } from "../../types";
import { NOTIFICATION_OPTIONS, NOTIFICATIONS_FOOTER, NotificationKind } from "../../utils/settingsOptions";
import { DEFAULT_NOTIFY_PREFS, type NotifyPrefs } from "../../utils/airingPlan";
import { loadNotifyPrefs, setNotifyPref } from "../../services/notifyPrefs";

/** Settings → Notifications: per-device alert switches (saved on this device, no network) + what blocks them */
export default function NotificationsScreen() {
	const { top } = useSafeAreaInsets();
	const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
	const swipeBack = useSwipeBackPop(navigation);
	const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_NOTIFY_PREFS);
	const [permissionDenied, setPermissionDenied] = useState(false);
	const [batteryRestricted, setBatteryRestricted] = useState(false);

	useEffect(() => {
		loadNotifyPrefs().then(setPrefs);
	}, []);

	// What blocks alerts: re-read on return from the system settings
	const checkStatus = useCallback(async () => {
		if (Platform.OS !== "android") return;
		const permission = await Notifications.getPermissionsAsync().catch(() => null);
		setPermissionDenied(permission ? !permission.granted : false);
		const optimised = await Battery.isBatteryOptimizationEnabledAsync().catch(() => false);
		setBatteryRestricted(optimised);
	}, []);
	useEffect(() => {
		checkStatus();
		const sub = AppState.addEventListener("change", (state) => {
			if (state === "active") checkStatus();
		});
		return () => sub.remove();
	}, [checkStatus]);

	const change = (kind: NotificationKind, value: boolean) => {
		setPrefs((cur) => ({ ...cur, [kind]: value }));
		setNotifyPref(kind, value).then(setPrefs);
	};

	return (
		<SwipeBackView onBack={() => navigation.goBack()} {...swipeBack} style={styles.container}>
			<ScrollView style={{ paddingTop: top }}>
				<View style={styles.headerRow}>
					<CircleBackButton onPress={() => navigation.goBack()} />
					<Text style={styles.headerTitle}>Notifications</Text>
					<View style={styles.headerSpacer} />
				</View>

				{permissionDenied || batteryRestricted ? (
					<View style={styles.section}>
						{permissionDenied ? (
							<TouchableOpacity
								style={styles.row}
								onPress={() => IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS)}
							>
								<View style={styles.rowTextWrap}>
									<Text style={[styles.rowText, styles.rowTextDanger]}>Notifications are off for Watchloom</Text>
									<Text style={styles.rowHint}>Tap to open the system settings</Text>
								</View>
							</TouchableOpacity>
						) : null}
						{batteryRestricted ? (
							<TouchableOpacity
								style={[styles.row, permissionDenied && styles.rowDivider]}
								onPress={() =>
									IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
								}
							>
								<View style={styles.rowTextWrap}>
									<Text style={styles.rowText}>Battery optimisation may delay alerts</Text>
									<Text style={styles.rowHint}>Tap to open the system battery settings</Text>
								</View>
							</TouchableOpacity>
						) : null}
					</View>
				) : null}

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Alerts</Text>
					{NOTIFICATION_OPTIONS.map((option) => (
						<View key={option.kind} style={[styles.row, styles.rowDivider]}>
							<View style={styles.rowTextWrap}>
								<Text style={styles.rowText}>{option.label}</Text>
								<Text style={styles.rowHint}>{option.hint}</Text>
							</View>
							<Switch
								value={prefs[option.kind]}
								onValueChange={(value) => change(option.kind, value)}
								// Accent track, as the app's other controls (Android's default teal is off-palette)
								trackColor={{ true: colors.accent, false: colors.border }}
								thumbColor={colors.onPrimary}
								accessibilityLabel={option.label}
							/>
						</View>
					))}
				</View>
				<Text style={styles.footer}>{NOTIFICATIONS_FOOTER}</Text>
			</ScrollView>
		</SwipeBackView>
	);
}

const styles = themedStyles(() => StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.background },
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.sm,
	},
	headerSpacer: { width: CIRCLE_BUTTON_SIZE },
	headerTitle: { ...typography.title, flex: 1, textAlign: "center", fontSize: 18 },
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
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.md,
	},
	rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
	rowTextWrap: { flex: 1 },
	rowText: { ...typography.subtitle, fontSize: 15, color: colors.text },
	rowTextDanger: { color: colors.destructiveRed },
	rowHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
	footer: {
		...typography.caption,
		color: colors.textMuted,
		textAlign: "center",
		marginHorizontal: spacing.lg,
		marginVertical: spacing.lg,
	},
}));
