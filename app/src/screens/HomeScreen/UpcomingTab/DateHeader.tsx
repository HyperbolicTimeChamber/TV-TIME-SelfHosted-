import { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, typography } from "../../../theme";

interface Props {
	date: string;
}

function formatDate(dateStr: string) {
	const date = new Date(dateStr + "T00:00:00");
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	const tomorrow = new Date(now);
	tomorrow.setDate(tomorrow.getDate() + 1);

	if (date.getTime() === now.getTime()) return "Today";
	if (date.getTime() === tomorrow.getTime()) return "Tomorrow";

	const sameYear = date.getFullYear() === now.getFullYear();
	return date.toLocaleDateString("en-US", {
		weekday: "long",
		month: "short",
		day: "numeric",
		...(sameYear ? {} : { year: "numeric" }),
	});
}

export default memo(function DateHeader({ date }: Props) {
	return (
		<View style={styles.container}>
			<Text style={styles.text}>{formatDate(date)}</Text>
		</View>
	);
});

const styles = StyleSheet.create({
	container: {
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
		backgroundColor: colors.background,
	},
	text: {
		...typography.subtitle,
		color: colors.textSecondary,
		textTransform: "uppercase",
		fontSize: 12,
		letterSpacing: 1,
	},
});
