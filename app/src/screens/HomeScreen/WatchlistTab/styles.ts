import { StyleSheet } from "react-native";
import { colors, spacing, themedStyles } from "../../../theme";

export const styles = themedStyles(() => StyleSheet.create({
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
	// A new Previously Watched row grows in from its top edge; hidden until its grow has started
	growIn: { transformOrigin: "top" },
	growWaiting: { opacity: 0 },
	// Leaving card's layer over the list: clipped at the pinned header's bottom edge
	leavingClip: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		overflow: "hidden",
	},
	// RowHeight content while its height animates: laid out at its own height
	// Zoom about the centre (a row zooming in / out of its slot)
	zoomCentre: { transformOrigin: "center" },
	// The "What's Up Next" copy riding under a row zooming in: at the row's slot end
	headerRide: { position: "absolute", left: 0, right: 0 },
	headerGlide: { position: "absolute", left: 0, right: 0 },
	leavingCard: { position: "absolute", left: 0, right: 0, backgroundColor: colors.background },
}));
