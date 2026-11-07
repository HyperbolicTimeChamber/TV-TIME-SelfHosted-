import React, { type ReactNode } from "react";
import { TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, themedStyles } from "../theme";
import { CircleButtonTone } from "../enums";

const FILL = themedStyles<Record<CircleButtonTone, string>>(() => ({
	[CircleButtonTone.OVERLAY]: colors.badgeOverlay,
	[CircleButtonTone.SURFACE]: colors.surface,
	[CircleButtonTone.SURFACE_LIGHT]: colors.surfaceLight,
	[CircleButtonTone.RAISED]: colors.border,
	[CircleButtonTone.ACCENT]: colors.warningAmber,
}));

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

/** Icon color that reads on each tone: dark scrim -> white, accent fill -> onPrimary, else the text color */
function iconColor(tone: CircleButtonTone = CircleButtonTone.SURFACE): string {
	if (tone === CircleButtonTone.OVERLAY) return colors.onImage;
	if (tone === CircleButtonTone.ACCENT) return colors.onPrimary;
	return colors.text;
}

/** Circular back button (Ionicons' chevron sits 2px left of centre — corrected here, once) */
export function CircleBackButton(props: Omit<Props, "children" | "accessibilityLabel">) {
	return (
		<CircleButton {...props} accessibilityLabel="Back">
			<Ionicons name="chevron-back" size={26} color={iconColor(props.tone)} style={styles.chevron} />
		</CircleButton>
	);
}

/** Same footprint as a CircleButton — balances a header so its title stays centred */
export const CIRCLE_BUTTON_SIZE = 44;

const styles = themedStyles(() => StyleSheet.create({
	circle: {
		width: CIRCLE_BUTTON_SIZE,
		height: CIRCLE_BUTTON_SIZE,
		borderRadius: CIRCLE_BUTTON_SIZE / 2,
		alignItems: "center",
		justifyContent: "center",
	},
	chevron: { marginRight: 2 },
}));
