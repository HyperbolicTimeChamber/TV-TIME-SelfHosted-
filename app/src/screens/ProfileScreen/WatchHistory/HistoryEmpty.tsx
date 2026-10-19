import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { MediaType } from "../../../enums";
import { colors, spacing, typography } from "../../../theme";

/** Squidward, gesturing at nothing (transparent WebP, width / height) */
const SQUIDWARD_ART = require("../../../../assets/history-empty.webp");
const SQUIDWARD_RATIO = 517 / 720;
const ART_H = 220;

/** Hall of Shame with nothing in it: Squidward on the left, his take on the right */
export default function HistoryEmpty({
	mediaType,
	filtered,
}: {
	mediaType: MediaType;
	/** Filters are on (there may be history, just none matching) */
	filtered: boolean;
}) {
	const kind = mediaType === MediaType.MOVIE ? "movies" : "shows";
	return (
		<View style={styles.row}>
			<Image
				source={SQUIDWARD_ART}
				style={{ height: ART_H, width: ART_H * SQUIDWARD_RATIO }}
				contentFit="contain"
			/>
			<View style={styles.text}>
				<Text style={styles.title}>
					{filtered ? "Oh, look. Nothing." : "What did you expect to find here?"}
				</Text>
				<Text style={styles.body}>
					{filtered
						? `Not one of your ${kind} fits these filters. Shocking, I know.`
						: `You haven't watched any ${kind} yet. Truly a cruel reminder of how empty this place is.`}
				</Text>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	// Fills the page under the tabs, the pair centred in it — nudged up (true centre reads low)
	row: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: spacing.lg,
		paddingBottom: 120,
		gap: spacing.md,
	},
	text: {
		flex: 1,
	},
	title: {
		...typography.subtitle,
		fontSize: 18,
		color: colors.text,
	},
	body: {
		...typography.body,
		marginTop: spacing.sm,
		color: colors.textSecondary,
		fontStyle: "italic",
	},
});
