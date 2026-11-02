import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
	Easing,
	interpolate,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";

// Sizes mirror the web PanLoader.module.scss (1 unit = 1px there)
const PAN_W = 120;
const PAN_H = 14;
const HANDLE_W = 70;
const HANDLE_H = 10;
const PIVOT_X = 170;
const EGG_W = 55;
const EGG_H = 53;
const STAGE_W = PAN_W + HANDLE_W;
/** Room above the pan for the egg's toss and the pan's swing */
const STAGE_TOP = 85;

const PAN_SWING_MS = 500;
const EGG_MS = 1000;

// The egg's 3D toss (web: rotate3d keyframes) flattened to what a phone view can do:
// rising lifts it, and tilting it face-on stretches it taller (scaleY ≈ cos of the tilt)
const EGG_T = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
const EGG_Y = [-20, -30, -40, -50, -40, -30, -20];
const EGG_X = [0, 0, 0, -3, 0, 0, 0];
const EGG_SCALE_Y = [0, 0.05, 0.34, 0.64, 0.34, 0.05, 0];
const EGG_TILT = [0, 0, 4, -6, -2, 0, 0];
const EGG_OPACITY = [0, 1, 1, 1, 1, 1, 0];

/** The loading pan: a frying pan swinging while it tosses an egg (web PanLoader mirrors it in CSS) */
export default function PanLoader() {
	const swing = useSharedValue(0);
	const toss = useSharedValue(0);

	useEffect(() => {
		swing.value = withRepeat(
			withTiming(1, { duration: PAN_SWING_MS, easing: Easing.linear }),
			-1,
			true,
		);
		toss.value = withRepeat(withTiming(1, { duration: EGG_MS, easing: Easing.out(Easing.quad) }), -1);
	}, [swing, toss]);

	const panStyle = useAnimatedStyle(() => ({
		transform: [{ rotate: `${interpolate(swing.value, [0, 1], [-5, 10])}deg` }],
	}));
	const eggStyle = useAnimatedStyle(() => ({
		opacity: interpolate(toss.value, EGG_T, EGG_OPACITY),
		transform: [
			{ translateX: interpolate(toss.value, EGG_T, EGG_X) },
			{ translateY: interpolate(toss.value, EGG_T, EGG_Y) },
			{ rotate: `${interpolate(toss.value, EGG_T, EGG_TILT)}deg` },
			{ scaleY: interpolate(toss.value, EGG_T, EGG_SCALE_Y) },
		],
	}));

	return (
		<View style={styles.stage} accessibilityRole="progressbar" accessibilityLabel="Preparing your data">
			<Animated.View style={[styles.pan, { transformOrigin: [PIVOT_X, 0, 0] }, panStyle]}>
				<View style={styles.panBody} />
				<View style={styles.handle}>
					<LinearGradient colors={["#6c4924", "#4b2d21"]} style={styles.grip} />
					<View style={styles.rivet} />
					<View style={styles.collar} />
				</View>
				<Animated.View style={[styles.egg, eggStyle]}>
					<View style={styles.yolkRim} />
					<View style={styles.yolk} />
					<View style={styles.shine} />
				</Animated.View>
			</Animated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	stage: {
		width: STAGE_W,
		paddingTop: STAGE_TOP,
		paddingBottom: 16,
		alignSelf: "center",
	},
	pan: { width: PAN_W, height: PAN_H },
	panBody: {
		...StyleSheet.absoluteFill,
		backgroundColor: "#3e494d",
		borderTopWidth: 1,
		borderTopColor: "#5d6063",
		borderBottomLeftRadius: 15,
		borderBottomRightRadius: 15,
	},
	handle: {
		position: "absolute",
		left: PAN_W - 2,
		top: 0,
		width: HANDLE_W,
		height: HANDLE_H,
		borderTopRightRadius: 4,
		borderBottomRightRadius: 4,
		overflow: "hidden",
	},
	grip: { position: "absolute", right: 0, top: 0, width: 50, height: HANDLE_H },
	rivet: { position: "absolute", left: 17, top: 1, width: 4, height: 8, backgroundColor: "#4d5457" },
	collar: { position: "absolute", left: 0, top: 3, width: 24, height: 4, backgroundColor: "#9f9e9e" },
	egg: {
		position: "absolute",
		left: PAN_W / 2 - EGG_W / 2,
		top: 0,
		width: EGG_W,
		height: EGG_H,
		backgroundColor: "#fff",
		borderRadius: EGG_H / 2,
		overflow: "hidden",
	},
	// Two stacked circles read as a yolk with a rim, offset up-left like the CSS gradients
	yolkRim: {
		position: "absolute",
		left: EGG_W / 2 - 13,
		top: EGG_H / 2 - 13,
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: "#ffae00",
	},
	yolk: {
		position: "absolute",
		left: EGG_W / 2 - 14,
		top: EGG_H / 2 - 14,
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: "#ffc400",
	},
	shine: {
		position: "absolute",
		left: EGG_W / 2 - 7,
		top: EGG_H / 2 - 9,
		width: 6,
		height: 6,
		borderRadius: 3,
		backgroundColor: "rgba(255,255,255,0.4)",
	},
});
