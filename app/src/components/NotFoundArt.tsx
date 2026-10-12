import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet } from "react-native";

const NOT_FOUND_ART = require("../../assets/not-found.png");
const ART_RATIO = 600 / 587;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
// Cap by width and by ~42% of the screen height so the text always has room
// Last term: on short screens shrink the art so it never reaches the buttons
export const ART_HEIGHT = Math.max(0, Math.min(SCREEN_W / ART_RATIO, SCREEN_H * 0.42, 420, SCREEN_H * 0.86 - 300));
const ART_WIDTH = ART_HEIGHT * ART_RATIO;

/**
 * Character art flush with the bottom edge of its (flex: 1) parent: the cropped legs
 * read as climbing out of the screen. Reserve ART_HEIGHT under any content above it.
 */
export default function NotFoundArt() {
	const climb = useRef(new Animated.Value(ART_HEIGHT)).current;

	useEffect(() => {
		// Character pops up from below the screen edge
		Animated.spring(climb, { toValue: 0, damping: 11, stiffness: 90, delay: 120, useNativeDriver: true }).start();
	}, [climb]);

	return (
		<Animated.Image
			source={NOT_FOUND_ART}
			style={[styles.art, { transform: [{ translateY: climb }] }]}
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
		width: ART_WIDTH,
		height: ART_HEIGHT,
	},
});
