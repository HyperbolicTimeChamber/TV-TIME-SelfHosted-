import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../../theme";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import { CircleBackButton, CIRCLE_BUTTON_SIZE } from "../../components/CircleButton";
import { ProfileStackParamList } from "../../types";
import {
	ACCENT_OPTIONS,
	COMING_SOON,
	THEME_OPTIONS,
	ThemeMode,
} from "../../utils/settingsOptions";

/** Placeholder: shows the planned theme + accent choices, none of them applies yet */
export default function AppearanceScreen() {
	const { top } = useSafeAreaInsets();
	const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
	const swipeBack = useSwipeBackPop(navigation);

	return (
		<SwipeBackView onBack={() => navigation.goBack()} {...swipeBack} style={styles.container}>
			<ScrollView style={{ paddingTop: top }}>
				<View style={styles.headerRow}>
					<CircleBackButton onPress={() => navigation.goBack()} />
					<Text style={styles.headerTitle}>Appearance</Text>
					<View style={styles.headerSpacer} />
				</View>
				<Text style={styles.soon}>{COMING_SOON}: these options are not active yet.</Text>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Theme</Text>
					{THEME_OPTIONS.map((option) => (
						<View key={option.mode} style={styles.row}>
							<Text style={styles.rowText}>{option.label}</Text>
							<View style={[styles.radio, option.mode === ThemeMode.DARK && styles.radioOn]} />
						</View>
					))}
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Accent color</Text>
					<View style={styles.swatches}>
						{ACCENT_OPTIONS.map((option, index) => (
							<View key={option.label} style={styles.swatchWrap}>
								<View
									style={[
										styles.swatch,
										{ backgroundColor: option.color },
										index === 0 && styles.swatchOn,
									]}
								/>
								<Text style={styles.swatchLabel}>{option.label}</Text>
							</View>
						))}
					</View>
				</View>
			</ScrollView>
		</SwipeBackView>
	);
}

const styles = StyleSheet.create({
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
		justifyContent: "space-between",
		paddingVertical: spacing.lg,
		paddingHorizontal: spacing.md,
		borderTopWidth: 1,
		borderTopColor: colors.border,
	},
	rowText: { ...typography.subtitle, fontSize: 15, color: colors.text },
	radio: {
		width: 20,
		height: 20,
		borderRadius: 10,
		borderWidth: 2,
		borderColor: colors.textMuted,
	},
	radioOn: { borderColor: colors.accent, backgroundColor: colors.accent },
	swatches: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.lg,
		padding: spacing.md,
		borderTopWidth: 1,
		borderTopColor: colors.border,
	},
	swatchWrap: { alignItems: "center", gap: spacing.xs },
	swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: "transparent" },
	swatchOn: { borderColor: colors.text },
	swatchLabel: { ...typography.caption, color: colors.textMuted },
});
