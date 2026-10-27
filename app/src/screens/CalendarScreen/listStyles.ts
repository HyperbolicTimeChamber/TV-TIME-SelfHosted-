import { Dimensions, StyleSheet } from "react-native";
import { colors, fonts, spacing, typography } from "../../theme";

export const CARD_WIDTH = Dimensions.get("window").width - 32;
export const CARD_MIN_HEIGHT = 120;
// Episode square spans the card's height minus its vertical padding
const EP_SQUARE = CARD_MIN_HEIGHT - spacing.md * 2;

/** Day list cards */
export const listStyles = StyleSheet.create({
	listContent: { paddingBottom: spacing.xl },
	episodeCard: {
		minHeight: CARD_MIN_HEIGHT,
		flexDirection: "row",
		alignItems: "center",
		marginHorizontal: spacing.lg,
		marginBottom: spacing.md,
		padding: spacing.md,
		borderRadius: 16,
		overflow: "hidden",
		backgroundColor: colors.surface,
	},
	// Episode under an opened show card: plain one-line strip (no backdrop)
	childCard: {
		height: 52,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		marginHorizontal: spacing.lg,
		marginBottom: spacing.sm,
		paddingLeft: 6,
		paddingRight: spacing.md,
		borderRadius: 12,
		overflow: "hidden",
		backgroundColor: colors.surface,
	},
	// Exx in a translucent square (pill background), inset 6px like top/bottom
	childEpBox: {
		width: 40,
		height: 40,
		borderRadius: 8,
		backgroundColor: colors.badgeOverlay,
		alignItems: "center",
		justifyContent: "center",
		// Smooch Sans leaves room under the digits — nudge down to look centred
		paddingTop: 2,
	},
	childEp: {
		fontFamily: fonts.smoochMedium,
		fontSize: 22,
		color: colors.text,
		letterSpacing: 0.5,
		includeFontPadding: false,
	},
	childTitle: { ...typography.body, flex: 1, fontSize: 15, fontWeight: "500", color: colors.text },
	cardOverlay: { backgroundColor: "rgba(0, 0, 0, 0.55)" },
	epInfo: { flex: 1 },
	logo: { height: 36, width: "60%", marginBottom: spacing.sm },
	showTitle: {
		...typography.subtitle,
		fontSize: 14,
	},
	// SEASON xx title, rule, big Exx (movies: release year); fills the card's inner height
	epSquare: {
		width: EP_SQUARE,
		height: EP_SQUARE,
		marginLeft: spacing.md,
		backgroundColor: colors.badgeOverlay,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.sm,
		// Smooch Sans digits leave extra room under them — nudge the stack down
		paddingTop: 6,
	},
	epSquareTitle: {
		fontFamily: fonts.smoochMedium,
		fontSize: 16,
		letterSpacing: 1.5,
		color: colors.text,
	},
	epSquareRule: {
		alignSelf: "stretch",
		height: 1,
		backgroundColor: colors.text,
		marginVertical: 6,
	},
	epSquareValue: {
		fontFamily: fonts.smoochRegular,
		fontSize: 56,
		color: colors.text,
		lineHeight: 58,
	},
	// Arrow fills rule → bottom edge (cancelling the rule's bottom margin) and centres in it
	epSquareArrow: {
		flex: 1,
		alignSelf: "stretch",
		alignItems: "center",
		justifyContent: "center",
		marginTop: -6,
	},
	// Four lines: tighter gaps (and no top nudge) so the time keeps room below it
	epSquareTimed: { paddingTop: 0 },
	epSquareRuleTimed: { marginVertical: 4 },
	// With a time under it, Exx shrinks so all four lines fit the square
	epSquareValueTimed: { fontSize: 44, lineHeight: 40 },
	epSquareTime: {
		fontFamily: fonts.smoochMedium,
		fontSize: 14,
		lineHeight: 14,
		letterSpacing: 0.5,
		color: colors.text,
	},
	epSquareYear: { fontSize: 40, lineHeight: 44 },
	movieBadge: {
		alignSelf: "flex-start",
		backgroundColor: colors.moviePurple,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		borderRadius: 4,
		marginTop: spacing.xs,
	},
	movieBadgeText: {
		fontSize: 10,
		fontWeight: "700",
		color: colors.text,
		letterSpacing: 0.5,
	},
	epTitle: {
		...typography.body,
		color: colors.text,
		marginTop: spacing.xs,
		fontSize: 15,
		fontWeight: "500",
	},
});
