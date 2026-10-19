import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors, spacing, typography } from "../../theme";

/** Shikamaru, sighing (transparent WebP, width / height) */
const DRAG_ART = require("../../../assets/empty-day.webp");
const DRAG_RATIO = 190 / 226;

/** A calendar day with nothing on — `compact` in the full-view day popup */
export default function EmptyDay({ compact = false }: { compact?: boolean }) {
	const artH = compact ? 96 : 140;
	return (
		<View style={[styles.container, compact && styles.compact]}>
			<Image
				source={DRAG_ART}
				style={{ height: artH, width: artH * DRAG_RATIO }}
				contentFit="contain"
			/>
			<Text style={styles.title}>What a drag… nothing to watch today.</Text>
			<Text style={styles.tagline}>
				Guess you'll just have to watch the clouds instead. Way less troublesome.
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	// Fills the rest of the day page and centres in it (the popup sizes to content instead)
	container: {
		flexGrow: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingHorizontal: spacing.lg,
		paddingTop: spacing.md,
		paddingBottom: spacing.xl,
	},
	compact: {
		paddingTop: 0,
		paddingBottom: spacing.lg,
	},
	title: {
		...typography.subtitle,
		marginTop: spacing.md,
		color: colors.text,
		textAlign: "center",
	},
	tagline: {
		...typography.body,
		marginTop: spacing.xs,
		color: colors.textSecondary,
		fontStyle: "italic",
		textAlign: "center",
	},
});
