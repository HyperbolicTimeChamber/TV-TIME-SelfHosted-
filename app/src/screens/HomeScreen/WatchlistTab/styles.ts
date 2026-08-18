import { StyleSheet } from "react-native";
import { colors, spacing, typography } from "../../../theme";

export const styles = StyleSheet.create({
	list: {
		flex: 1,
		backgroundColor: colors.surface,
	},
	listContent: {
		paddingVertical: spacing.sm,
	},
	center: {
		flex: 1,
		backgroundColor: colors.surface,
		justifyContent: "center",
		alignItems: "center",
	},
	empty: {
		...typography.subtitle,
		color: colors.textSecondary,
	},
	addShowsButton: {
		marginTop: spacing.lg,
		backgroundColor: colors.primary,
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.md,
		borderRadius: 8,
	},
	addShowsText: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.text,
	},
	loaderRow: {
		paddingVertical: spacing.lg,
		alignItems: "center",
	},
	separator: {
		height: spacing.sm,
	},
});
