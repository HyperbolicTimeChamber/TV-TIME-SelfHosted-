import React, { type ReactNode } from "react";
import { TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { CircleButtonTone } from "../enums";

const FILL: Record<CircleButtonTone, string> = {
	[CircleButtonTone.OVERLAY]: colors.badgeOverlay,
	[CircleButtonTone.SURFACE]: colors.surface,
	[CircleButtonTone.SURFACE_LIGHT]: colors.surfaceLight,
};

interface Props {
	onPress: () => void;
	tone?: CircleButtonTone;
	/** Positioning from the caller (e.g. absolute over a backdrop) */
	style?: StyleProp<ViewStyle>;
	accessibilityLabel: string;
	children: ReactNode;
}

/** 44px circular icon button — the one shape for back / share buttons everywhere */
export default function CircleButton({
	onPress,
	tone = CircleButtonTone.SURFACE,
	style,
	accessibilityLabel,
	children,
}: Props) {
	return (
		<TouchableOpacity
			style={[styles.circle, { backgroundColor: FILL[tone] }, style]}
			onPress={onPress}
			activeOpacity={0.7}
			hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
		>
			{children}
		</TouchableOpacity>
	);
}

/** Circular back button (Ionicons' chevron sits 2px left of centre — corrected here, once) */
export function CircleBackButton(props: Omit<Props, "children" | "accessibilityLabel">) {
	return (
		<CircleButton {...props} accessibilityLabel="Back">
			<Ionicons name="chevron-back" size={26} color={colors.text} style={styles.chevron} />
		</CircleButton>
	);
}

/** Same footprint as a CircleButton — balances a header so its title stays centred */
export const CIRCLE_BUTTON_SIZE = 44;

const styles = StyleSheet.create({
	circle: {
		width: CIRCLE_BUTTON_SIZE,
		height: CIRCLE_BUTTON_SIZE,
		borderRadius: CIRCLE_BUTTON_SIZE / 2,
		alignItems: "center",
		justifyContent: "center",
	},
	chevron: { marginRight: 2 },
});
