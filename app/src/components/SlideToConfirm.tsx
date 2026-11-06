import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
	Easing,
	interpolate,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { colors, typography } from "../theme";

/** Track height; the knob sits inside it with KNOB_INSET all round */
const TRACK_H = 56;
const KNOB_INSET = 4;
const KNOB = TRACK_H - KNOB_INSET * 2;
/** Room either side of the label: the knob's slot plus a gap, the same on both sides so the
 *  label sits in the middle of the track */
const SIDE = KNOB + KNOB_INSET * 2 + 12;
/** The fill trails the knob, lighter (the knob carries the full colour) */
const FILL_OPACITY = 0.35;
/** Past this share of the travel a release confirms */
const CONFIRM_AT = 0.85;
/** A flick this fast (px/s) confirms from half way — a quick swipe is enough (Emil) */
const FLICK_VELOCITY = 800;
const FLICK_FROM = 0.5;
/** Released short: springs home, no bounce */
const SPRING_BACK = { damping: 22, stiffness: 260, mass: 0.8 };
/** Released past the line: the rest of the way, quick ease-out */
const FINISH = { duration: 160, easing: Easing.bezier(0.23, 1, 0.32, 1) };

interface Props {
	label: string;
	/** The track fills with it as the knob travels */
	color: string;
	onConfirm: () => void;
	/** The action is running: the knob holds at the end with a spinner */
	loading?: boolean;
}

/**
 * Slide to confirm (the pause / remove drawers): drag the knob to the end — or flick it — to run
 * the action. A release short of the line springs it home. Screen readers get a plain button.
 */
export default function SlideToConfirm({ label, color, onConfirm, loading = false }: Props) {
	const [trackW, setTrackW] = useState(0);
	const max = Math.max(0, trackW - KNOB - KNOB_INSET * 2);
	const x = useSharedValue(0);
	const done = useSharedValue(false);
	const start = useSharedValue(0);

	// The action finished without closing the drawer (it failed): back to the start
	useEffect(() => {
		if (loading) return;
		done.value = false;
		x.value = withSpring(0, SPRING_BACK);
	}, [loading, done, x]);

	const confirm = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
		onConfirm();
	};

	const pan = Gesture.Pan()
		.enabled(!loading && max > 0)
		// Sideways only: a downward pull still drags the drawer closed
		.activeOffsetX([-8, 8])
		.failOffsetY([-12, 12])
		.onStart(() => {
			start.value = x.value;
		})
		// From the touch-down (translation includes the slop before activation): the knob stays
		// under the finger instead of trailing it
		.onUpdate((e) => {
			if (done.value) return;
			x.value = Math.min(max, Math.max(0, start.value + e.translationX));
		})
		.onEnd((e) => {
			if (done.value) return;
			// Where the finger let go (the last move can arrive with the release)
			const share = Math.min(max, Math.max(0, start.value + e.translationX)) / max;
			if (share >= CONFIRM_AT || (e.velocityX > FLICK_VELOCITY && share >= FLICK_FROM)) {
				done.value = true;
				x.value = withTiming(max, FINISH);
				runOnJS(confirm)();
			} else {
				x.value = withSpring(0, { ...SPRING_BACK, velocity: e.velocityX });
			}
		});

	const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
	// The colour follows the knob: the track fills behind it
	const fillStyle = useAnimatedStyle(() => ({ width: x.value + KNOB + KNOB_INSET * 2 }));
	// The words give way as the knob covers them
	const labelStyle = useAnimatedStyle(() => ({
		opacity: max > 0 ? interpolate(x.value, [0, max * 0.6], [1, 0], "clamp") : 1,
	}));

	return (
		<GestureDetector gesture={pan}>
			<View
				style={styles.track}
				onLayout={(e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width)}
				accessible
				accessibilityRole="button"
				accessibilityLabel={label}
				accessibilityActions={[{ name: "activate" }]}
				onAccessibilityAction={() => !loading && confirm()}
			>
				<Reanimated.View
					style={[styles.fill, { backgroundColor: color, opacity: FILL_OPACITY }, fillStyle]}
				/>
				<Reanimated.Text style={[styles.label, labelStyle]} numberOfLines={1}>
					{label}
				</Reanimated.Text>
				<Reanimated.View style={[styles.knob, { backgroundColor: color }, knobStyle]}>
					{loading ? (
						<ActivityIndicator size="small" color={colors.text} />
					) : (
						<Ionicons name="chevron-forward" size={24} color={colors.text} />
					)}
				</Reanimated.View>
			</View>
		</GestureDetector>
	);
}

const styles = StyleSheet.create({
	// 80% of the drawer, centred; the label sits in the middle (the knob's room each side)
	track: {
		alignSelf: "center",
		width: "80%",
		paddingHorizontal: SIDE,
		height: TRACK_H,
		borderRadius: TRACK_H / 2,
		backgroundColor: colors.surfaceLight,
		justifyContent: "center",
		overflow: "hidden",
	},
	fill: {
		position: "absolute",
		left: 0,
		top: 0,
		bottom: 0,
		borderRadius: TRACK_H / 2,
	},
	label: {
		...typography.subtitle,
		fontSize: 16,
		color: colors.textSecondary,
		textAlign: "center",
	},
	knob: {
		position: "absolute",
		left: KNOB_INSET,
		top: KNOB_INSET,
		width: KNOB,
		height: KNOB,
		borderRadius: KNOB / 2,
		alignItems: "center",
		justifyContent: "center",
	},
});
