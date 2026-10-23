import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../theme";

interface Props {
	/** Distance from the bottom of the parent (include the safe-area inset where needed) */
	bottom: number;
	onPress: () => void;
	/** Sort (or filters) changed from the default — shows a dot */
	customised: boolean;
	accessibilityLabel: string;
}

/** Floating red sort button, bottom-right — opens a SortSheet */
export default function SortFab({ bottom, onPress, customised, accessibilityLabel }: Props) {
	return (
		<TouchableOpacity style={[styles.fab, { bottom }]} onPress={onPress} accessibilityLabel={accessibilityLabel}>
			<Ionicons name="options-outline" size={24} color={colors.text} />
			{customised && <View style={styles.dot} />}
		</TouchableOpacity>
	);
}

/** Height + gap a list should leave at its end so the last row clears the button */
export const SORT_FAB_CLEARANCE = 72;

const styles = StyleSheet.create({
	fab: {
		position: "absolute",
		right: spacing.lg,
		width: 56,
		height: 56,
		borderRadius: 28,
		backgroundColor: colors.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	// Not at default
	dot: {
		position: "absolute",
		top: 12,
		right: 12,
		width: 9,
		height: 9,
		borderRadius: 5,
		backgroundColor: colors.text,
	},
});
