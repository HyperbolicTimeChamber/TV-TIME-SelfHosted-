import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from "react-native";
import { colors } from "../theme";
import { withHaptic } from "../utils/haptics";
import { HiCheck } from "./HiIcons";

interface Props {
	watched?: boolean;
	loading?: boolean;
	size?: number;
	/** Tick size override (default size * 0.72) */
	checkSize?: number;
	label?: string;
	labelColor?: string;
	backgroundColor?: string;
	onPress?: () => void;
	onLongPress?: () => void;
	disabled?: boolean;
}

/** Watchlist cards' checkmark: circle + tick (3px under the default tick) */
export const WATCHLIST_CHECK_CIRCLE = 38;
export const WATCHLIST_CHECK_TICK = WATCHLIST_CHECK_CIRCLE * 0.72 - 3;

export default function CheckmarkButton({
	watched,
	loading,
	size = 30,
	checkSize,
	label,
	labelColor,
	backgroundColor,
	onPress,
	onLongPress,
	disabled,
}: Props) {
	const iconSize = size * 0.55;
	// HiCheck's glyph fills ~2/3 of its box (Ionicons' filled more): drawn larger to read as big
	const tickSize = checkSize ?? size * 0.72;
	const bg = backgroundColor ?? (watched ? colors.watchedGreen : colors.text);
	const iconColor = watched ? colors.text : colors.checkTick;
	const textColor = labelColor ?? (watched ? colors.text : colors.background);

	return (
		<TouchableOpacity
			style={[
				styles.base,
				{
					width: size,
					height: size,
					borderRadius: size / 2,
					backgroundColor: bg,
				},
				loading && { opacity: 0.5 },
			]}
			onPress={onPress}
			onLongPress={withHaptic(onLongPress)}
			disabled={disabled || loading}
			hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
		>
			{loading ? (
				<ActivityIndicator size={iconSize} color={iconColor} />
			) : label ? (
				<Text style={[styles.label, { fontSize: size * 0.38, color: textColor }]}>{label}</Text>
			) : (
				<HiCheck size={tickSize} color={iconColor} />
			)}
		</TouchableOpacity>
	);
}

const styles = StyleSheet.create({
	base: {
		justifyContent: "center",
		alignItems: "center",
	},
	label: {
		fontWeight: "700",
	},
});
