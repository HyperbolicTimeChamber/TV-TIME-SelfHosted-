import { useMemo, type ReactNode } from "react";
import { useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
	type SharedValue,
} from "react-native-reanimated";

// Same feel as the Home / History pagers
export const SWIPE_BACK_SLIDE_MS = 250;
const START_PX = 25;
const TURN_SHARE = 0.3;
const FLICK_VELOCITY = 500;

/**
 * Slide a screen off to the right and pop it once it's gone. The screen underneath only shows
 * through when the route is a transparentModal (swipeBackScreenOptions) — a native stack doesn't
 * draw the screen below a regular push
 */
export function slideOffAndBack(x: SharedValue<number>, width: number, onBack: () => void) {
	"worklet";
	x.value = withTiming(width, { duration: SWIPE_BACK_SLIDE_MS }, (done) => {
		if (done) runOnJS(onBack)();
	});
}

/** Right swipe anywhere on the screen: it follows the finger, then pops (or settles back) */
export default function SwipeBackView({
	onBack,
	style,
	children,
}: {
	onBack: () => void;
	style?: StyleProp<ViewStyle>;
	children: ReactNode;
}) {
	const { width } = useWindowDimensions();
	const x = useSharedValue(0);
	// translationX at activation — the pan only starts after START_PX, without this it jumps
	const grab = useSharedValue(0);
	const pan = useMemo(
		() =>
			Gesture.Pan()
				.activeOffsetX(START_PX)
				.failOffsetY([-15, 15])
				.onStart((e) => {
					"worklet";
					grab.value = e.translationX;
				})
				.onUpdate((e) => {
					"worklet";
					x.value = Math.max(0, e.translationX - grab.value);
				})
				.onEnd((e) => {
					"worklet";
					if (x.value > width * TURN_SHARE || e.velocityX > FLICK_VELOCITY) {
						slideOffAndBack(x, width, onBack);
					} else {
						x.value = withTiming(0, { duration: SWIPE_BACK_SLIDE_MS });
					}
				}),
		[width, x, grab, onBack],
	);
	const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
	return (
		<GestureDetector gesture={pan}>
			<Animated.View style={[style, slide]}>{children}</Animated.View>
		</GestureDetector>
	);
}
