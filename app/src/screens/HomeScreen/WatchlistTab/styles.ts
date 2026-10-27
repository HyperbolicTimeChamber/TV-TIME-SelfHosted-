import { StyleSheet } from "react-native";
import { colors, spacing } from "../../../theme";

export const styles = StyleSheet.create({
	list: {
		flex: 1,
		backgroundColor: colors.background,
	},
	listContent: {
		paddingVertical: spacing.sm,
	},
	center: {
		flex: 1,
		backgroundColor: colors.background,
		justifyContent: "center",
		alignItems: "center",
	},
	loaderRow: {
		paddingVertical: spacing.lg,
		alignItems: "center",
	},
	// Space between the last Up Next card and the caught-up footer, and below its button
	caughtUpFooter: {
		paddingTop: spacing.xxl,
		paddingBottom: spacing.xxl,
	},
	separator: {
		height: spacing.sm,
	},
});
