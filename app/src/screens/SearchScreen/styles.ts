import { StyleSheet } from "react-native";
import { colors, spacing, typography } from "../../theme";
import { artHeight, NO_RESULTS_RATIO } from "../../components/NotFoundArt";

export const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	content: { flex: 1 },
	headerBlock: {
		position: "absolute" as const,
		top: 0,
		left: 0,
		right: 0,
		zIndex: 1,
		// No backdrop: the search card floats over the results (a black strip behind it showed
		// square corners under its rounded ones)
	},
	searchBarRow: {
		flexDirection: "row",
		alignItems: "stretch",
	},
	// Margins live here (not on the card) so the backdrop's 50% bottom lands on the card's middle
	headerCardWrap: {
		marginHorizontal: spacing.md,
		marginTop: spacing.md,
	},
	// Top is set inline to reach the screen top (safe area + the wrap's margin)
	headerBackdrop: {
		position: "absolute" as const,
		left: -spacing.md,
		right: -spacing.md,
		bottom: "50%",
		backgroundColor: colors.background,
	},
	headerCard: {
		backgroundColor: colors.surface,
		borderRadius: 12,
		overflow: "hidden",
		// Lifts the floating island off the posters scrolling under it
		elevation: 8,
		shadowColor: colors.background,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.5,
		shadowRadius: 10,
	},
	// Left inset only — the input's own padding is the gap to the text
	backButton: {
		paddingLeft: spacing.md,
		justifyContent: "center",
	},
	searchIconWrap: {
		width: 44,
		justifyContent: "center",
		alignItems: "center",
	},
	searchRow: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
	},
	searchInput: {
		...typography.body,
		flex: 1,
		color: colors.text,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.lg,
	},
	// Inside the grid (already inset by spacing.lg); bottom = title gap + the grid's top gap
	listTitle: {
		...typography.subtitle,
		paddingTop: spacing.md,
		paddingBottom: spacing.sm * 2,
	},
	center: {
		flex: 1,
		justifyContent: "center" as const,
		alignItems: "center" as const,
	},
	grid: {
		paddingHorizontal: spacing.lg,
		paddingTop: spacing.sm,
	},
	row: {
		gap: spacing.sm,
		paddingHorizontal: spacing.sm,
		marginBottom: spacing.xs,
	},
	card: {
		flex: 1,
		overflow: "hidden" as const,
		borderRadius: 6,
	},
	poster: {
		aspectRatio: 2 / 3,
		borderRadius: 6,
		backgroundColor: colors.surface,
		width: "100%",
	},
	banner: {
		position: "absolute" as const,
		bottom: 0,
		left: 0,
		right: 0,
		backgroundColor: colors.overlayLight,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
	},
	cardTitle: {
		...typography.caption,
		color: colors.text,
		flexShrink: 1,
	},
	cardYear: {
		...typography.caption,
		fontSize: 11,
	},
	watchlistBadge: {
		position: "absolute" as const,
		top: 6,
		right: 6,
		width: 26,
		height: 26,
		borderRadius: 13,
		borderWidth: 2,
		borderColor: colors.text,
		backgroundColor: colors.badgeOverlay,
		justifyContent: "center" as const,
		alignItems: "center" as const,
		zIndex: 1,
	},
	watchlistBadgeActive: {
		backgroundColor: colors.watchedGreen,
		borderColor: colors.watchedGreen,
	},
	// "Add to List" — mirrors the watchlist badge on the opposite corner; blue = already in a list
	listBadge: {
		position: "absolute" as const,
		top: 6,
		left: 6,
		width: 26,
		height: 26,
		borderRadius: 13,
		borderWidth: 2,
		borderColor: colors.text,
		backgroundColor: colors.badgeOverlay,
		justifyContent: "center" as const,
		alignItems: "center" as const,
		zIndex: 1,
	},
	listBadgeActive: {
		backgroundColor: colors.accent,
		borderColor: colors.accent,
	},
	watchlistBadgeText: {
		fontSize: 16,
		fontWeight: "700" as const,
		color: colors.text,
		lineHeight: 18,
	},
	watchlistBadgeTextActive: {
		fontSize: 14,
	},
	bannerTop: {
		flexDirection: "row" as const,
		alignItems: "center" as const,
		justifyContent: "space-between" as const,
		gap: 4,
	},
	typeBadge: {
		backgroundColor: colors.primary,
		borderRadius: 4,
		paddingHorizontal: 6,
		paddingVertical: 2,
		flexShrink: 0,
	},
	typeBadgeMovie: {
		backgroundColor: colors.moviePurple,
	},
	typeBadgeText: {
		color: colors.text,
		fontSize: 10,
		fontWeight: "700" as const,
	},
	// Text sits just above the character art pinned to the bottom edge
	emptyWrap: {
		flex: 1,
		alignItems: "center" as const,
		justifyContent: "flex-end" as const,
		paddingHorizontal: spacing.xxl,
		paddingBottom: artHeight(NO_RESULTS_RATIO) + spacing.xl,
	},
	emptyText: {
		...typography.subtitle,
		color: colors.textSecondary,
		textAlign: "center" as const,
	},
	emptyHint: {
		...typography.caption,
		color: colors.textMuted,
		textAlign: "center" as const,
		marginTop: spacing.xs,
	},
});
