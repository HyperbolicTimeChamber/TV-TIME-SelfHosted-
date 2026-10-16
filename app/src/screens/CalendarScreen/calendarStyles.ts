import { StyleSheet } from "react-native";
import { colors, spacing, typography } from "../../theme";
import { CARD_MIN_HEIGHT } from "./listStyles";

/** Calendar size, also the animation progress value: week strip → month → full screen */
export enum CalendarMode {
	WEEK = 0,
	MONTH = 1,
	FULL = 2,
}

/** Height of one week row in week / month view */
export const ROW_MONTH = 52;
export const WEEKDAY_ROW = 22;

export const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.background },
	// Month name centred, today button on the right
	header: {
		height: 52,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.lg,
	},
	monthTitle: { ...typography.title, fontSize: 20, letterSpacing: 1 },
	todayButton: {
		position: "absolute",
		right: spacing.lg,
		width: 28,
		height: 28,
		borderRadius: 7,
		borderWidth: 1.5,
		borderColor: colors.text,
		alignItems: "center",
		justifyContent: "center",
	},
	todayButtonText: { color: colors.text, fontSize: 12, fontWeight: "700" },
	weekdays: { flexDirection: "row", height: WEEKDAY_ROW, paddingHorizontal: 4 },
	weekday: { flex: 1, textAlign: "center", fontSize: 11, color: colors.textSecondary },
	body: { flex: 1 },
	calendar: { overflow: "hidden" },
	weekRow: { flexDirection: "row", paddingHorizontal: 4 },
	cell: { flex: 1, padding: 1.5 },
	tile: {
		flex: 1,
		borderRadius: 6,
		backgroundColor: colors.surface,
		paddingTop: 4,
		borderWidth: 1,
		borderColor: "transparent",
		overflow: "hidden",
	},
	// Selected day: outlined cell
	tileSelected: { borderColor: colors.textSecondary },
	dimmed: { opacity: 0.35 },
	dayNumberBox: {
		alignSelf: "center",
		minWidth: 22,
		height: 20,
		borderRadius: 6,
		alignItems: "center",
		justifyContent: "center",
	},
	// Today: number in a filled white box
	todayBox: { backgroundColor: colors.text },
	dayNumber: { fontSize: 12, fontWeight: "600", color: colors.text },
	todayNumber: { color: colors.background },
	sunday: { color: colors.primary },
	markArea: { flex: 1, marginTop: 3 },
	bars: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 3, gap: 2 },
	bar: { height: 3, borderRadius: 2 },
	chips: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 2, gap: 2 },
	chip: {
		fontSize: 9,
		lineHeight: 13,
		color: colors.text,
		borderRadius: 3,
		paddingHorizontal: 2,
		overflow: "hidden",
	},
	chipMore: { fontSize: 9, color: colors.textSecondary, paddingHorizontal: 2 },
	listArea: { flex: 1, overflow: "hidden" },
	// "15 THU" over each day's list
	dayHeader: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 6,
		paddingHorizontal: spacing.lg,
		paddingTop: spacing.lg,
		paddingBottom: spacing.md,
	},
	dayHeaderNumber: { ...typography.title, fontSize: 26 },
	dayHeaderWeekday: { fontSize: 12, fontWeight: "700", color: colors.textSecondary, letterSpacing: 1 },
	skeletonHeader: {
		width: 120,
		height: 26,
		borderRadius: 6,
		marginHorizontal: spacing.lg,
		marginTop: spacing.lg,
		marginBottom: spacing.md,
		backgroundColor: colors.surfaceLight,
	},
	skeletonCard: {
		height: CARD_MIN_HEIGHT,
		marginHorizontal: spacing.lg,
		marginBottom: spacing.md,
		borderRadius: 16,
		backgroundColor: colors.surfaceLight,
	},
	// Full view: a day's cards in a popup
	dayPopup: {
		backgroundColor: colors.background,
		borderRadius: 20,
		borderWidth: 1,
		borderColor: colors.border,
		paddingBottom: spacing.sm,
		overflow: "hidden",
	},
	modalContent: {
		backgroundColor: colors.surface,
		borderRadius: 16,
		width: 200,
		height: 350,
		paddingVertical: spacing.lg,
		alignItems: "center",
	},
	modalTitle: { ...typography.subtitle, marginBottom: spacing.md },
	yearList: { flex: 1, width: "100%" },
	yearItem: { height: 52, justifyContent: "center", alignItems: "center" },
	yearItemActive: { backgroundColor: colors.primary, marginHorizontal: spacing.lg, borderRadius: 8 },
	yearItemText: { ...typography.body, fontSize: 18, color: colors.textSecondary },
	yearItemTextActive: { color: colors.text, fontWeight: "700" },
});
