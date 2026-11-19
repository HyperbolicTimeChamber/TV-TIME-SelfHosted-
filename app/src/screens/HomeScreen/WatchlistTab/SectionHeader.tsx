import { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, typography, themedStyles } from "../../../theme";

interface Props {
	title: string;
}

export default memo(function SectionHeader({ title }: Props) {
	return (
		<View style={styles.container} pointerEvents="box-none">
			<View style={styles.pill}>
				<Text style={styles.text}>{title}</Text>
			</View>
		</View>
	);
});

const styles = themedStyles(() => StyleSheet.create({
	container: {
		paddingTop: spacing.sm,
		paddingBottom: spacing.sm,
		alignItems: "center",
	},
	pill: {
		backgroundColor: colors.primary,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.xs,
		borderRadius: 16,
	},
	text: {
		...typography.subtitle,
		color: colors.onPrimary,
		textTransform: "uppercase",
		fontSize: 12,
		letterSpacing: 1,
	},
}));
