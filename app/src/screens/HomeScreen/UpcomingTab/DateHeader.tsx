import { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, typography } from "../../../theme";
import { todayStr } from "../../../utils/todayStr";

interface Props {
	date: string;
}

function formatDate(dateStr: string) {
	const date = new Date(dateStr + "T00:00:00");
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	const tomorrow = new Date(now);
	tomorrow.setDate(tomorrow.getDate() + 1);
	const yesterday = new Date(now);
	yesterday.setDate(yesterday.getDate() - 1);

	if (date.getTime() === now.getTime()) return "Today";
	if (date.getTime() === tomorrow.getTime()) return "Tomorrow";
	if (date.getTime() === yesterday.getTime()) return "Yesterday";

	const sameYear = date.getFullYear() === now.getFullYear();
	return date.toLocaleDateString("en-US", {
		weekday: "long",
		month: "short",
		day: "numeric",
		...(sameYear ? {} : { year: "numeric" }),
	});
}

export default memo(function DateHeader({ date }: Props) {
	const isPast = date < todayStr();
	return (
		<View style={styles.container}>
			<View style={[styles.pill, isPast && styles.pillPast]}>
				<Text style={styles.text}>{formatDate(date)}</Text>
			</View>
		</View>
	);
});

const styles = StyleSheet.create({
	container: {
		paddingTop: spacing.xs,
		paddingBottom: spacing.md,
		alignItems: "center",
	},
	pill: {
		backgroundColor: colors.primary,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.xs,
		borderRadius: 16,
	},
	pillPast: {
		backgroundColor: colors.border,
	},
	text: {
		...typography.subtitle,
		color: colors.text,
		textTransform: "uppercase",
		fontSize: 12,
		letterSpacing: 1,
	},
});
