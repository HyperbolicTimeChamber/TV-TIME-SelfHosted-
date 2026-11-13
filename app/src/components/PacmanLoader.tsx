import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { colors, themedStyles } from "../theme";

// Sizes and timing mirror the web PacmanLoader.module.scss (codepen.io/poziomq/pen/ozaYKK)
const SIZE = 60;
const STAGE_W = 160;
const DOT = 12;
/** Dots sit this far apart and slide one gap per chomp, into the mouth */
const DOT_GAP = 40;
const CHOMP_MS = 500;
const MOUTH_DEG = 45;
const PAC_YELLOW = "#FFFB16";
const DOT_WHITE = "#EFEFEF";
/** CSS `ease` (the pen's chomp) */
const CSS_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

/** The importing loader: a chomping Pac-Man eating dots that slide in from the right */
export default function PacmanLoader({ background = colors.surface }: { background?: string }) {
	const chomp = useSharedValue(0);
	const slide = useSharedValue(0);

	useEffect(() => {
		chomp.value = withRepeat(
			withSequence(
				withTiming(1, { duration: CHOMP_MS / 2, easing: CSS_EASE }),
				withTiming(0, { duration: CHOMP_MS / 2, easing: CSS_EASE }),
			),
			-1,
		);
		slide.value = withRepeat(withTiming(1, { duration: CHOMP_MS, easing: Easing.linear }), -1);
	}, [chomp, slide]);

	const top = useAnimatedStyle(() => ({
		transform: [{ rotate: `${-MOUTH_DEG * chomp.value}deg` }],
	}));
	const bottom = useAnimatedStyle(() => ({
		transform: [{ rotate: `${MOUTH_DEG * chomp.value}deg` }],
	}));
	const dots = useAnimatedStyle(() => ({ transform: [{ translateX: -DOT_GAP * slide.value }] }));

	return (
		<View style={styles.stage} accessibilityRole="progressbar" accessibilityLabel="Loading">
			<Animated.View style={[styles.dots, dots]}>
				{[2, 1, 0].map((i) => (
					<View key={i} style={[styles.dot, { right: i * DOT_GAP }]} />
				))}
			</Animated.View>
			<View style={styles.pacman}>
				<Animated.View style={[styles.part, top]}>
					<View style={styles.topHalf} />
				</Animated.View>
				<Animated.View style={[styles.part, bottom]}>
					<View style={styles.bottomHalf} />
				</Animated.View>
				<View style={styles.part}>
					<View style={styles.leftHalf} />
				</View>
				<View style={[styles.eye, { backgroundColor: background }]} />
			</View>
		</View>
	);
}

const styles = themedStyles(() => StyleSheet.create({
	stage: { width: STAGE_W, height: SIZE, alignSelf: "center", marginVertical: 24 },
	dots: { position: "absolute", left: -5, top: 0, height: SIZE, width: 180 },
	dot: {
		position: "absolute",
		top: 25,
		width: DOT,
		height: DOT,
		borderRadius: DOT / 2,
		backgroundColor: DOT_WHITE,
	},
	pacman: { position: "absolute", left: 0, top: 0, width: SIZE, height: SIZE },
	part: { position: "absolute", left: 0, top: 0, width: SIZE, height: SIZE },
	topHalf: {
		position: "absolute",
		top: 0,
		width: SIZE,
		height: SIZE / 2,
		borderTopLeftRadius: SIZE / 2,
		borderTopRightRadius: SIZE / 2,
		backgroundColor: PAC_YELLOW,
	},
	bottomHalf: {
		position: "absolute",
		bottom: 0,
		width: SIZE,
		height: SIZE / 2,
		borderBottomLeftRadius: SIZE / 2,
		borderBottomRightRadius: SIZE / 2,
		backgroundColor: PAC_YELLOW,
	},
	leftHalf: {
		position: "absolute",
		left: 0,
		width: SIZE / 2,
		height: SIZE,
		borderTopLeftRadius: SIZE / 2,
		borderBottomLeftRadius: SIZE / 2,
		backgroundColor: PAC_YELLOW,
	},
	eye: { position: "absolute", top: 10, left: 30, width: 7, height: 7, borderRadius: 3.5 },
}));
