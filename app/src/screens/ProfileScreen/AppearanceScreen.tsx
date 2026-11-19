import React, { useState } from "react";
import {
	ActivityIndicator,
	View,
	Text,
	ScrollView,
	StyleSheet,
	TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
	colors,
	spacing,
	typography,
	themedStyles,
	ACCENT_OPTIONS,
	THEME_OPTIONS,
} from "../../theme";
import { getActiveThemePrefs, setThemePrefs } from "../../theme/prefs";
import type { ThemePrefs } from "../../theme";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import { CircleBackButton, CIRCLE_BUTTON_SIZE } from "../../components/CircleButton";
import { ProfileStackParamList } from "../../types";

/** Theme (dark / light / system) and accent color. Applies at once: the app remounts on the change */
export default function AppearanceScreen() {
	const { top } = useSafeAreaInsets();
	const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
	const swipeBack = useSwipeBackPop(navigation);
	// This screen remounts with the rest of the tree, so reading the live prefs is enough
	const prefs = getActiveThemePrefs();
	// The option being applied: the whole app remounts on the change, which holds the JS thread
	// for a moment. Its spinner (native, keeps turning meanwhile) shows the tap landed, and every
	// other tap waits — repeated taps queued one remount after another
	const [pending, setPending] = useState<string | null>(null);
	const apply = (key: string, next: ThemePrefs) => {
		if (pending) return;
		if (next.mode === prefs.mode && next.accent === prefs.accent) return;
		setPending(key);
		// Two frames: the spinner is on screen before the remount starts
		requestAnimationFrame(() => requestAnimationFrame(() => setThemePrefs(next)));
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
					{THEME_OPTIONS.map((option) => (
						<TouchableOpacity
							key={option.mode}
							style={styles.row}
							disabled={!!pending}
							onPress={() => apply(option.mode, { ...prefs, mode: option.mode })}
						>
							<Text style={styles.rowText}>{option.label}</Text>
							{pending === option.mode ? (
								<ActivityIndicator size="small" color={colors.accent} style={styles.radioSpinner} />
							) : (
								<View style={[styles.radio, option.mode === prefs.mode && styles.radioOn]} />
							)}
						</TouchableOpacity>
					))}
				</View>

				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Accent color</Text>
					<View style={styles.swatches}>
						{ACCENT_OPTIONS.map((option) => (
							<TouchableOpacity
								key={option.id}
								style={styles.swatchWrap}
								disabled={!!pending}
								onPress={() => apply(option.id, { ...prefs, accent: option.id })}
							>
								<View style={[styles.swatch, option.id === prefs.accent && styles.swatchOn]}>
									<View style={[styles.swatchFill, { backgroundColor: option.primary }]} />
									{option.accent !== option.primary && (
										<View style={[styles.swatchHalf, { backgroundColor: option.accent }]} />
									)}
									{pending === option.id && (
										<View style={styles.swatchBusy}>
											<ActivityIndicator size="small" color={colors.onImage} />
										</View>
									)}
								</View>
								<Text style={styles.swatchLabel}>{option.label}</Text>
							</TouchableOpacity>
						))}
					</View>
				</View>
			</ScrollView>
		</SwipeBackView>
	);
}

const SWATCH = 44;

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
		// Same footprint as the radio it replaces: the row doesn't shift
		radioSpinner: { width: 20, height: 20 },
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
		swatchBusy: {
			...StyleSheet.absoluteFill,
			alignItems: "center",
			justifyContent: "center",
			backgroundColor: colors.badgeOverlay,
		},
		swatchLabel: { ...typography.caption, color: colors.textSecondary },
	}),
);
