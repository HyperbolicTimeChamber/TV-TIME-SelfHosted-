import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet } from "react-native";

const NOT_FOUND_ART = require("../../assets/not-found.png");
const NOT_FOUND_RATIO = 600 / 587;
/** Empty search results character (width / height) */
export const NO_RESULTS_ART = require("../../assets/no-results.png");
export const NO_RESULTS_RATIO = 306 / 646;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
// Cap by width and by ~42% of the screen height so the text always has room
// Last term: on short screens shrink the art so it never reaches the buttons
export const ART_HEIGHT = Math.max(0, Math.min(SCREEN_W / NOT_FOUND_RATIO, SCREEN_H * 0.42, 420, SCREEN_H * 0.86 - 300));

/**
 * Character art flush with the bottom edge of its (flex: 1) parent: the cropped legs
 * read as climbing out of the screen. Reserve ART_HEIGHT under any content above it.
 */
export default function NotFoundArt({
	source = NOT_FOUND_ART,
	ratio = NOT_FOUND_RATIO,
}: {
	source?: number;
	/** Image width / height */
	ratio?: number;
}) {
	const climb = useRef(new Animated.Value(ART_HEIGHT)).current;

	useEffect(() => {
		// Character pops up from below the screen edge
		Animated.spring(climb, { toValue: 0, damping: 11, stiffness: 90, delay: 120, useNativeDriver: true }).start();
	}, [climb]);

	return (
		<Animated.Image
			source={source}
			style={[styles.art, { width: ART_HEIGHT * ratio, transform: [{ translateY: climb }] }]}
			resizeMode="contain"
			accessibilityIgnoresInvertColors
		/>
	);
}

const styles = StyleSheet.create({
	art: {
		position: "absolute",
		bottom: 0,
		alignSelf: "center",
		height: ART_HEIGHT,
	},
});
