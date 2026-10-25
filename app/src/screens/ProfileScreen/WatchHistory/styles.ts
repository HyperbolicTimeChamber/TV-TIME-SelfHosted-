import { StyleSheet } from "react-native";
import { colors, spacing } from "../../../theme";

/** Shared with the web card (same numbers → identical at phone width) */
export const CARD_RADIUS = 16;
export const CARD_ASPECT = 16 / 9;
export const LOGO_HEIGHT = 56;
export const RING_SIZE = 20;
export const RING_STROKE = 3;

export const styles = StyleSheet.create({
	pagerClip: { flex: 1, overflow: "hidden" },
	pages: { flex: 1, flexDirection: "row" },
	container: { flex: 1, backgroundColor: colors.background },
	// Full-width top bar on the page background (blends in): circular back + title, tabs underneath
	topBar: { backgroundColor: colors.background },
	tabs: { backgroundColor: colors.background, borderTopWidth: 0 },
	listArea: { flex: 1 },
	topFade: { position: "absolute", top: 0, left: 0, right: 0, height: 24 },
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingHorizontal: spacing.lg,
		paddingBottom: spacing.xs,
	},
	title: { flex: 1, textAlign: "center", fontSize: 20, fontWeight: "700", color: colors.text },
	backSpacer: { width: 44 },
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

	// Sort sheet (components/SortSheet) — filter section
	sheetFilterHead: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginTop: spacing.md,
	},
	sheetClear: { color: colors.primary, fontWeight: "600" },
	chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingBottom: spacing.sm },
	filterChip: {
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.sm,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: colors.border,
	},
	filterChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
	filterChipText: { color: colors.textSecondary, fontWeight: "600" },
	filterChipTextOn: { color: colors.text },

	// Card
	// 16:9 is the minimum (minHeight set from the card width in HistoryCardView) — the card
	// grows when a two-line title needs more room instead of clipping the bottom row
	card: {
		width: "100%",
		gap: spacing.md,
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
		marginBottom: spacing.sm,
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.md,
	},
	logo: { flex: 1, height: LOGO_HEIGHT },
	cardTitle: { flex: 1, color: colors.text, fontSize: 20, fontWeight: "600" },
	pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
	// Rewatch count: white circle at the pill's end, concentric (right = vertical padding)
	pillWithCount: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingVertical: 4,
		paddingRight: 4,
	},
	pillCountCircle: {
		minWidth: 20,
		height: 20,
		borderRadius: 10,
		paddingHorizontal: 5,
		backgroundColor: colors.text,
		alignItems: "center",
		justifyContent: "center",
	},
	pillCountText: { color: colors.surface, fontSize: 12, fontWeight: "700" },
	pillText: { color: colors.text, fontSize: 13, fontWeight: "700" },
	bottomRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
	leftBlock: { alignItems: "flex-start", gap: spacing.sm + 2 },
	timeBlock: { alignItems: "flex-end" },
	// Upper stat (Last Watched): normal spacing instead of the baseline pull-down
	statGap: { marginBottom: spacing.md },
	timeLabel: { color: colors.text, fontSize: 13, fontWeight: "500", marginBottom: 2 },
	// lineHeight = fontSize, pulled down by the font's descent so the digits' baseline
	// lines up with the bottom of the progress pill on the left
	timeSpent: {
		color: colors.text,
		fontSize: 30,
		lineHeight: 30,
		fontWeight: "600",
		letterSpacing: -0.5,
		marginBottom: -6,
	},
	// Same size as the progress pills, mirrored: circle on the right, concentric with that end
	watchCountPill: {
		paddingLeft: 10,
		paddingRight: 5,
		backgroundColor: `${colors.textSecondary}59`,
	},
	countCircle: {
		minWidth: 20,
		height: 20,
		borderRadius: 10,
		paddingHorizontal: 6,
		alignItems: "center",
		justifyContent: "center",
		// Lighter grey than the pill (textSecondary 70% vs 35%)
		backgroundColor: `${colors.textSecondary}B3`,
	},
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
		alignItems: "center",
		justifyContent: "center",
		// Softer red than the brand red, no glow
		backgroundColor: colors.destructiveRed,
		// Reads as round as the (larger) stat cards
		borderRadius: 16,
		height: 56,
		paddingHorizontal: spacing.lg,
		// Shares the row with the Settings circle
		flex: 1,
	},
	historyButtonText: { color: colors.text, fontSize: 17, fontWeight: "600" },
});
