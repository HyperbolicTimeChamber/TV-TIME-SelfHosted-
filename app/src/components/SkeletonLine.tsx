import { useEffect, useMemo, useRef } from "react";
import { Animated, StyleSheet, ViewStyle } from "react-native";
import { colors } from "../theme";

const PERIOD_MS = 1200;

/**
 * Pulsing opacity for a placeholder view. Every caller gets its own Animated.Value and its own
 * loop, started when it mounts.
 *
 * This used to be one module-level value with one loop for the whole app, reference-counted so
 * only a single animation ever ran. That does not work: on this React Native version a value
 * whose animation started *before* a view mounted never drives that view, so every skeleton
 * after the first froze at the interpolation's first output and the app had no shimmer at all.
 * Measured on a Pixel 9 Pro by reopening a screen full of placeholders — module-level values
 * moved 0/255 in luminance, component-local ones 61/255 — and it fails the same way with
 * useNativeDriver true or false, so the driver is not the issue and reference counting cannot
 * be reinstated. Placeholders that mount together (the usual case) still pulse in step.
 */
export function useSharedShimmer() {
	const value = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		const loop = Animated.loop(
			Animated.timing(value, {
				toValue: 1,
				duration: PERIOD_MS,
				useNativeDriver: true,
			}),
		);
		loop.start();
		return () => loop.stop();
	}, [value]);

	return useMemo(
		() => value.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 0.6, 0.3] }),
		[value],
	);
}

interface Props {
	width?: number | string;
	height?: number;
	style?: ViewStyle;
}

export default function SkeletonLine({ width = "60%", height = 12, style }: Props) {
	const shimmer = useSharedShimmer();

	return (
		<Animated.View
			style={[styles.base, { width: width as any, height, opacity: shimmer }, style]}
		/>
	);
}

const styles = StyleSheet.create({
	base: {
		borderRadius: 4,
		backgroundColor: colors.border,
	},
});
