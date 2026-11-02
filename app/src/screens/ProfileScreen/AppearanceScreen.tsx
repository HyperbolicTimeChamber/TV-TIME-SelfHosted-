import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { reloadAppAsync } from "expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography, ACCENT_OPTIONS, THEME_OPTIONS } from "../../theme";
import type { AccentId, ThemeMode, ThemePrefs } from "../../theme";
import { getActiveThemePrefs, saveThemePrefs } from "../../theme/prefs";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import { CircleBackButton, CIRCLE_BUTTON_SIZE } from "../../components/CircleButton";
import { ProfileStackParamList } from "../../types";

/** Theme (dark / light / system) and accent color. Saved at once; the app restarts to apply them */
export default function AppearanceScreen() {
	const { top } = useSafeAreaInsets();
	const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
	const swipeBack = useSwipeBackPop(navigation);
	const [active] = useState(getActiveThemePrefs);
	const [draft, setDraft] = useState<ThemePrefs>(active);
	const [restarting, setRestarting] = useState(false);
	const changed = draft.mode !== active.mode || draft.accent !== active.accent;

	const update = (next: ThemePrefs) => {
		setDraft(next);
		saveThemePrefs(next).catch(() => {});
	};

	const restart = async () => {
		if (restarting) return;
		setRestarting(true);
		try {
			await reloadAppAsync("Theme changed");
		} catch {
			setRestarting(false);
		}
	};

	return (
		<SwipeBackView onBack={() => navigation.goBack()} {...swipeBack} style={styles.container}>
			<ScrollView style={{ paddingTop: top }}>
				<View style={styles.headerRow}>
					<CircleBackButton onPress={() => navigation.goBack()} />
					<Text style={styles.headerTitle}>Appearance</Text>
					<View style={styles.headerSpacer} />
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Theme</Text>
					{THEME_OPTIONS.map((option) => {
						const selected = option.mode === draft.mode;
						return (
							<TouchableOpacity
								key={option.mode}
								style={styles.row}
								onPress={() => update({ ...draft, mode: option.mode as ThemeMode })}
							>
								<Text style={styles.rowText}>{option.label}</Text>
								<View style={[styles.radio, selected && styles.radioOn]} />
							</TouchableOpacity>
						);
					})}
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Accent color</Text>
					<View style={styles.swatches}>
						{ACCENT_OPTIONS.map((option) => {
							const selected = option.id === draft.accent;
							return (
								<TouchableOpacity
									key={option.id}
									style={styles.swatchWrap}
									onPress={() => update({ ...draft, accent: option.id as AccentId })}
								>
									<View style={[styles.swatch, selected && styles.swatchOn]}>
										<View style={[styles.swatchFill, { backgroundColor: option.primary }]} />
										{option.accent !== option.primary && (
											<View style={[styles.swatchHalf, { backgroundColor: option.accent }]} />
										)}
									</View>
									<Text style={styles.swatchLabel}>{option.label}</Text>
								</TouchableOpacity>
							);
						})}
					</View>
				</View>

				{changed && (
					<View style={styles.restartBox}>
						<Text style={styles.restartHint}>Restart the app to apply your choice.</Text>
						<TouchableOpacity style={styles.restartButton} onPress={restart} disabled={restarting}>
							<Text style={styles.restartText}>{restarting ? "Restarting…" : "Restart now"}</Text>
						</TouchableOpacity>
					</View>
				)}
			</ScrollView>
		</SwipeBackView>
	);
}

const SWATCH = 44;

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
	swatch: {
		width: SWATCH,
		height: SWATCH,
		borderRadius: SWATCH / 2,
		overflow: "hidden",
		borderWidth: 2,
		borderColor: "transparent",
	},
	swatchOn: { borderColor: colors.text },
	swatchFill: { ...StyleSheet.absoluteFill },
	/** Classic: today's blue accent as the lower half of the red swatch */
	swatchHalf: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: "50%",
	},
	swatchLabel: { ...typography.caption, color: colors.textSecondary },
	restartBox: {
		marginTop: spacing.lg,
		marginHorizontal: spacing.lg,
		marginBottom: spacing.xxl,
		alignItems: "center",
		gap: spacing.sm,
	},
	restartHint: { ...typography.caption },
	restartButton: {
		alignSelf: "stretch",
		alignItems: "center",
		paddingVertical: spacing.md,
		borderRadius: 8,
		backgroundColor: colors.primary,
	},
	restartText: { ...typography.subtitle, fontSize: 15, color: colors.onPrimary },
});
