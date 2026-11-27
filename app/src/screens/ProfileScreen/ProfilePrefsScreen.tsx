import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, Switch, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, themedStyles } from "../../theme";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import { CircleBackButton, CIRCLE_BUTTON_SIZE } from "../../components/CircleButton";
import { ProfileStackParamList } from "../../types";
import { PROFILE_LIST_COUNT_MAX, PROFILE_LIST_COUNT_MIN } from "../../enums";
import { useAuthStore } from "../../stores";
import { requireOnline } from "../../utils/requireOnline";
import type { ProfilePrefs } from "../../utils/profilePrefs";
import NameSection from "./NameSection";

/** Settings -> Profile: the name shown, how many lists the profile shows, and the completed rows */
export default function ProfilePrefsScreen() {
	const { top } = useSafeAreaInsets();
	const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
	const swipeBack = useSwipeBackPop(navigation);
	const user = useAuthStore((s) => s.user);
	const prefs = useAuthStore((s) => s.profilePrefs);
	const setProfilePrefs = useAuthStore((s) => s.setProfilePrefs);
	const atMin = prefs.listCount <= PROFILE_LIST_COUNT_MIN;
	const atMax = prefs.listCount >= PROFILE_LIST_COUNT_MAX;

	// Offline: the popup from requireOnline, nothing changes (a switch is controlled, it snaps back)
	const change = (patch: Partial<ProfilePrefs>) => {
		if (!user || !requireOnline()) return;
		setProfilePrefs(user.uid, patch);
	};

	return (
		<SwipeBackView onBack={() => navigation.goBack()} {...swipeBack} style={styles.container}>
			<ScrollView style={{ paddingTop: top }} keyboardShouldPersistTaps="handled">
				<View style={styles.headerRow}>
					<CircleBackButton onPress={() => navigation.goBack()} />
					<Text style={styles.headerTitle}>Profile</Text>
					<View style={styles.headerSpacer} />
				</View>

				<NameSection />

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Lists</Text>
					<View style={styles.row}>
						<View style={styles.rowTextWrap}>
							<Text style={styles.rowText}>Lists on Profile</Text>
							<Text style={styles.rowHint}>
								The first lists in your Lists page order. Empty lists are never shown.
							</Text>
						</View>
						<View style={styles.stepper}>
							<TouchableOpacity
								style={[styles.stepButton, atMin && styles.stepDisabled]}
								disabled={atMin}
								hitSlop={6}
								onPress={() => change({ listCount: prefs.listCount - 1 })}
								accessibilityRole="button"
								accessibilityLabel="Show one fewer list"
							>
								<Ionicons name="remove" size={20} color={colors.text} />
							</TouchableOpacity>
							<Text
								style={styles.stepValue}
								accessibilityLabel={`${prefs.listCount} lists on profile`}
							>
								{prefs.listCount}
							</Text>
							<TouchableOpacity
								style={[styles.stepButton, atMax && styles.stepDisabled]}
								disabled={atMax}
								hitSlop={6}
								onPress={() => change({ listCount: prefs.listCount + 1 })}
								accessibilityRole="button"
								accessibilityLabel="Show one more list"
							>
								<Ionicons name="add" size={20} color={colors.text} />
							</TouchableOpacity>
						</View>
					</View>
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Rows</Text>
					<View style={styles.row}>
						<View style={styles.rowTextWrap}>
							<Text style={styles.rowText}>Show Completed Rows</Text>
							<Text style={styles.rowHint}>Movies Watched and TV Shows Completed.</Text>
						</View>
						<Switch
							value={prefs.showCompleted}
							onValueChange={(value) => change({ showCompleted: value })}
							// Accent track, as the app's other controls (Android's default teal is off-palette)
							trackColor={{ true: colors.accent, false: colors.border }}
							thumbColor={colors.onPrimary}
							accessibilityLabel="Show completed rows"
						/>
					</View>
				</View>
			</ScrollView>
		</SwipeBackView>
	);
}

const STEP_SIZE = 36;

const styles = themedStyles(() =>
	StyleSheet.create({
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
			borderTopWidth: 1,
			borderTopColor: colors.border,
		},
		rowTextWrap: { flex: 1 },
		rowText: { ...typography.subtitle, fontSize: 15, color: colors.text },
		rowHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
		stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
		stepButton: {
			width: STEP_SIZE,
			height: STEP_SIZE,
			borderRadius: STEP_SIZE / 2,
			alignItems: "center",
			justifyContent: "center",
			backgroundColor: colors.surfaceLight,
		},
		stepDisabled: { opacity: 0.4 },
		stepValue: {
			...typography.subtitle,
			fontSize: 17,
			color: colors.text,
			minWidth: 24,
			textAlign: "center",
		},
	}),
);
