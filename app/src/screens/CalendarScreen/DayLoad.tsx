import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography, themedStyles } from "../../theme";
import { CalendarDayAction } from "../../utils/calendarRange";

export interface DayLoadState {
	action: CalendarDayAction;
	loading: boolean;
	/** The date's month, as shown on the button ("December") */
	month: string;
	onLoad: () => void;
}

/**
 * A date outside what Settings -> Calendar loads: nothing downloaded for it yet (LOAD, in place of the
 * day's cards), or an older saved copy (REFRESH, a button under them)
 */
export default function DayLoad({ action, loading, month, onLoad }: DayLoadState) {
	const refresh = action === CalendarDayAction.REFRESH;
	const label = refresh ? `Update ${month}` : `Load ${month}`;
	return (
		<View style={refresh ? styles.refresh : styles.container}>
			{!refresh && (
				<>
					<Ionicons name="cloud-download-outline" size={44} color={colors.textMuted} />
					<Text style={styles.title}>This date isn't loaded.</Text>
					<Text style={styles.hint}>It's outside the days set in Settings, Calendar.</Text>
				</>
			)}
			<TouchableOpacity
				style={[styles.button, refresh && styles.buttonQuiet]}
				onPress={onLoad}
				disabled={loading}
				accessibilityRole="button"
				accessibilityLabel={label}
				accessibilityState={{ busy: loading }}
			>
				{loading ? (
					<ActivityIndicator size="small" color={refresh ? colors.text : colors.onPrimary} />
				) : (
					<Text style={[styles.buttonText, refresh && styles.buttonTextQuiet]}>{label}</Text>
				)}
			</TouchableOpacity>
		</View>
	);
}

const styles = themedStyles(() =>
	StyleSheet.create({
		container: {
			flexGrow: 1,
			justifyContent: "center",
			alignItems: "center",
			paddingHorizontal: spacing.lg,
			paddingTop: spacing.md,
			paddingBottom: spacing.xl,
		},
		refresh: { alignItems: "center", paddingVertical: spacing.md },
		title: { ...typography.subtitle, marginTop: spacing.md, color: colors.text, textAlign: "center" },
		hint: {
			...typography.body,
			marginTop: spacing.xs,
			color: colors.textSecondary,
			textAlign: "center",
		},
		button: {
			marginTop: spacing.md,
			minWidth: 160,
			minHeight: 40,
			borderRadius: 20,
			paddingHorizontal: spacing.lg,
			alignItems: "center",
			justifyContent: "center",
			backgroundColor: colors.primary,
		},
		buttonQuiet: { marginTop: 0, backgroundColor: colors.surfaceLight },
		buttonText: { ...typography.subtitle, fontSize: 15, color: colors.onPrimary },
		buttonTextQuiet: { color: colors.text },
	}),
);
