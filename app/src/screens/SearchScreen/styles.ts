import { StyleSheet } from "react-native";
import { colors, spacing, typography } from "../../theme";

export const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	headerBlock: {
		position: "absolute" as const,
		top: 0,
		left: 0,
		right: 0,
		zIndex: 1,
		backgroundColor: colors.background,
	},
	searchBarRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	searchRow: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.surface,
	},
	searchIcon: {
		marginLeft: spacing.md,
	},
	searchInput: {
		...typography.body,
		flex: 1,
		color: colors.text,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.lg,
	},
	sectionTitle: {
		...typography.subtitle,
		paddingHorizontal: spacing.lg,
		paddingTop: spacing.md,
		paddingBottom: spacing.sm,
	},
	center: {
		flex: 1,
		justifyContent: "center" as const,
		alignItems: "center" as const,
	},
	grid: {
		paddingHorizontal: spacing.sm,
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
	modalContent: {
		backgroundColor: colors.surface,
		borderRadius: 12,
		padding: spacing.lg,
	},
	modalTitle: {
		...typography.subtitle,
		fontSize: 16,
		textAlign: "center" as const,
		marginBottom: spacing.lg,
	},
	modalButton: {
		backgroundColor: colors.primary,
		paddingVertical: spacing.md,
		borderRadius: 8,
		alignItems: "center" as const,
		marginBottom: spacing.sm,
	},
	modalButtonWatched: {
		backgroundColor: colors.watchedGreen,
	},
	modalButtonText: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.text,
	},
	modalCancel: {
		paddingVertical: spacing.sm,
		alignItems: "center" as const,
		marginTop: spacing.xs,
	},
	modalCancelText: {
		...typography.caption,
		color: colors.textMuted,
	},
	emptyText: {
		...typography.subtitle,
		color: colors.textSecondary,
	},
});
