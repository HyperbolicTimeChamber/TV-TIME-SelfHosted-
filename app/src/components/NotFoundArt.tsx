import React, { useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Easing, StyleSheet, View } from "react-native";

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
	onOverhang,
}: {
	source?: number;
	/** Image width / height */
	ratio?: number;
	/** Told how far the parent reaches below the screen, so content above can move up with the art */
	onOverhang?: (px: number) => void;
}) {
	const height = artHeight(ratio);
	// How far the parent reaches below the screen — the art sits at the visible bottom instead
	const [overhang, setOverhang] = useState(0);
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
		// Fills the parent (no transform) so its bottom can be measured: the parent may run past
		// the screen's bottom edge (e.g. space kept for a hidden tab bar), which hid the art's legs
		<View
			style={StyleSheet.absoluteFill}
			pointerEvents="none"
			onLayout={(e) =>
				(e.target as unknown as View).measureInWindow((_x, y, _w, h) => {
					const px = Math.max(0, y + h - Dimensions.get("screen").height);
					setOverhang(px);
					onOverhang?.(px);
				})
			}
		>
			<Animated.Image
				source={source}
				style={[
					styles.art,
					{
						bottom: overhang,
						height,
						width: height * ratio,
						opacity: fade,
						transform: [{ translateY: climb }],
					},
				]}
				resizeMode="contain"
				accessibilityIgnoresInvertColors
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	art: {
		position: "absolute",
		bottom: 0,
		alignSelf: "center",
	},
});
