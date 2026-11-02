import React from "react";
import { View, Text, ScrollView, StyleSheet, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography, themedStyles } from "../../theme";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import { CircleBackButton, CIRCLE_BUTTON_SIZE } from "../../components/CircleButton";
import { ProfileStackParamList } from "../../types";
import { COMING_SOON, NOTIFICATION_OPTIONS } from "../../utils/settingsOptions";

/** Placeholder: lists the planned reminder types as disabled switches, nothing is saved yet */
export default function NotificationsScreen() {
	const { top } = useSafeAreaInsets();
	const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
	const swipeBack = useSwipeBackPop(navigation);

	return (
		<SwipeBackView onBack={() => navigation.goBack()} {...swipeBack} style={styles.container}>
			<ScrollView style={{ paddingTop: top }}>
				<View style={styles.headerRow}>
					<CircleBackButton onPress={() => navigation.goBack()} />
					<Text style={styles.headerTitle}>Notifications</Text>
					<View style={styles.headerSpacer} />
				</View>
				<Text style={styles.soon}>{COMING_SOON}: these options are not active yet.</Text>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Reminders</Text>
					{NOTIFICATION_OPTIONS.map((option) => (
						<View key={option.kind} style={styles.row}>
							<View style={styles.rowTextWrap}>
								<Text style={styles.rowText}>{option.label}</Text>
								<Text style={styles.rowHint}>{option.hint}</Text>
							</View>
							<Switch value={false} disabled />
						</View>
					))}
				</View>
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
	soon: {
		...typography.caption,
		color: colors.textMuted,
		textAlign: "center",
		marginTop: spacing.sm,
	},
	section: {
		marginTop: spacing.lg,
		marginHorizontal: spacing.lg,
		backgroundColor: colors.surface,
		borderRadius: 8,
		overflow: "hidden",
		opacity: 0.6,
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
		borderTopWidth: 1,
		borderTopColor: colors.border,
	},
	rowTextWrap: { flex: 1 },
	rowText: { ...typography.subtitle, fontSize: 15, color: colors.text },
	rowHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
}));
