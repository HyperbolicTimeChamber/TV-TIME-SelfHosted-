import { StyleSheet } from "react-native";
import { colors, spacing } from "../../../theme";

/** Shared with the web card (same numbers → identical at phone width) */
export const CARD_RADIUS = 16;
export const CARD_ASPECT = 16 / 9;
export const LOGO_HEIGHT = 40;
export const RING_SIZE = 20;
export const RING_STROKE = 3;

export const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.background },
	headerCard: {
		backgroundColor: colors.surface,
		borderRadius: 12,
		marginHorizontal: spacing.md,
		marginTop: spacing.md,
		overflow: "hidden",
	},
	titleRow: { flexDirection: "row", alignItems: "stretch", minHeight: 48 },
	backButton: {
		width: 44,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: colors.surfaceLight,
	},
	title: {
		flex: 1,
		alignSelf: "center",
		paddingHorizontal: spacing.md,
		fontSize: 17,
		fontWeight: "700",
		color: colors.text,
	},
	list: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
	separator: { height: spacing.lg },
	empty: {
		textAlign: "center",
		color: colors.text,
		fontSize: 15,
		fontWeight: "600",
		marginTop: "40%",
	},
	footer: { paddingVertical: spacing.xl },

	// Card
	card: {
		width: "100%",
		aspectRatio: CARD_ASPECT,
		borderRadius: CARD_RADIUS,
		backgroundColor: colors.surface,
		padding: spacing.lg,
		overflow: "hidden",
		justifyContent: "space-between",
	},
	cardOverlay: { backgroundColor: "rgba(0, 0, 0, 0.55)" },
	// Logo + status pill on top, then full-width title, then the Ongoing / Ended / year pill
	topBlock: { alignItems: "flex-start", gap: spacing.sm },
	topRow: {
		alignSelf: "stretch",
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	logo: { height: LOGO_HEIGHT, width: "34%", marginBottom: spacing.xs },
	cardTitle: { alignSelf: "stretch", color: colors.text, fontSize: 17, fontWeight: "700" },
	pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
	pillText: { color: colors.text, fontSize: 11, fontWeight: "700" },
	bottomRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
	timeSpent: { color: colors.text, fontSize: 30, fontWeight: "700", letterSpacing: -0.5 },
	watchCountPill: { alignSelf: "flex-start", marginTop: spacing.xs },
	progressPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		borderRadius: 999,
		// Left = vertical padding → icon/ring sits concentric with the rounded end
		paddingLeft: 5,
		paddingRight: 10,
		paddingVertical: 5,
	},
	progressText: { fontSize: 14, fontWeight: "700" },
	progressIcon: { margin: -1 },
	// Light grey (textSecondary) at 35% — translucent over the backdrop
	tagPill: {
		borderRadius: 999,
		paddingHorizontal: 10,
		paddingVertical: 3,
		backgroundColor: `${colors.textSecondary}59`,
	},
	tag: { color: colors.text, fontSize: 12, fontWeight: "600" },

	// Profile entry button
	historyButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: colors.primary,
		borderRadius: 999,
		height: 56,
		paddingLeft: spacing.xl,
		paddingRight: 8,
		marginTop: spacing.lg,
		marginHorizontal: spacing.lg,
		shadowColor: colors.primary,
		shadowOpacity: 0.35,
		shadowRadius: 12,
		shadowOffset: { width: 0, height: 6 },
		elevation: 6,
	},
	historyButtonText: { color: colors.text, fontSize: 17, fontWeight: "600" },
	historyButtonArrow: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: colors.text,
		justifyContent: "center",
		alignItems: "center",
	},
});
