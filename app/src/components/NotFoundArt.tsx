import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Easing, StyleSheet } from "react-native";

const NOT_FOUND_ART = require("../../assets/not-found.png");
const NOT_FOUND_RATIO = 600 / 587;
/** Empty search results character (width / height) */
export const NO_RESULTS_ART = require("../../assets/no-results.png");
export const NO_RESULTS_RATIO = 306 / 646;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

/**
 * Art height for an image of this width / height ratio: half the screen, never wider
 * than the screen; the last term shrinks it on short screens so it never
 * reaches the text and buttons above.
 */
export const artHeight = (ratio = NOT_FOUND_RATIO) =>
	Math.max(0, Math.min(SCREEN_W / ratio, SCREEN_H * 0.5, 560, SCREEN_H * 0.9 - 280));

/**
 * Character art flush with the bottom edge of its (flex: 1) parent: the cropped legs
 * read as climbing out of the screen. Reserve artHeight(ratio) under content above it.
 */
export default function NotFoundArt({
	source = NOT_FOUND_ART,
	ratio = NOT_FOUND_RATIO,
	inlineHeight,
}: {
	source?: number;
	/** Image width / height */
	ratio?: number;
	/** In the layout flow at this height (e.g. above a message) instead of pinned to the bottom edge */
	inlineHeight?: number;
}) {
	const height = inlineHeight ?? artHeight(ratio);
	const climb = useRef(new Animated.Value(height)).current;
	const fade = useRef(new Animated.Value(0)).current;

	useEffect(() => {
		// Slides up from below the screen edge while fading in, no overshoot
		const config = {
			toValue: 0,
			duration: 350,
			delay: 120,
			easing: Easing.out(Easing.cubic),
			useNativeDriver: true,
		};
		Animated.parallel([
			Animated.timing(climb, config),
			Animated.timing(fade, { ...config, toValue: 1 }),
		]).start();
	}, [climb, fade]);

	return (
		<Animated.Image
			source={source}
			style={[
				!inlineHeight && styles.art,
				{ height, width: height * ratio, opacity: fade, transform: [{ translateY: climb }] },
			]}
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
	},
});
