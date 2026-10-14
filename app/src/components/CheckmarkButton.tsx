import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

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
			onLongPress={onLongPress}
			disabled={disabled || loading}
			hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
		>
			{loading ? (
				<ActivityIndicator size={iconSize} color={iconColor} />
			) : label ? (
				<Text style={[styles.label, { fontSize: size * 0.38, color: textColor }]}>{label}</Text>
			) : (
				<Ionicons name="checkmark" size={iconSize} color={iconColor} />
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
