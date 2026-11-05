import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from "react-native";
import { colors } from "../theme";
import { withHaptic } from "../utils/haptics";
import { HiCheck } from "./HiIcons";

interface Props {
	watched?: boolean;
	loading?: boolean;
	size?: number;
	label?: string;
	labelColor?: string;
	backgroundColor?: string;
	onPress?: () => void;
	onLongPress?: () => void;
	disabled?: boolean;
}

export default function CheckmarkButton({
	watched,
	loading,
	size = 30,
	label,
	labelColor,
	backgroundColor,
	onPress,
	onLongPress,
	disabled,
}: Props) {
	const iconSize = size * 0.55;
	// HiCheck's glyph fills ~2/3 of its box (Ionicons' filled more): drawn larger to read as big
	const checkSize = size * 0.72;
	const bg = backgroundColor ?? (watched ? colors.watchedGreen : colors.text);
	const iconColor = watched ? colors.text : colors.textMuted;
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
				<HiCheck size={checkSize} color={iconColor} />
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
