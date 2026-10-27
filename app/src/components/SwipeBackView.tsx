import { useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
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
	onSwipeStart,
	onSwipeCancel,
	style,
	children,
}: {
	onBack: () => void;
	/** The drag was claimed — the screen is about to follow the finger (see `useSwipeBackPop`) */
	onSwipeStart?: () => void;
	/** …and let go short of the threshold, so the screen stays */
	onSwipeCancel?: () => void;
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
					if (onSwipeStart) runOnJS(onSwipeStart)();
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
						if (onSwipeCancel) runOnJS(onSwipeCancel)();
					}
				}),
		[width, x, grab, onBack, onSwipeStart, onSwipeCancel],
	);
	const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
	return (
		<GestureDetector gesture={pan}>
			<Animated.View style={[style, slide]}>{children}</Animated.View>
		</GestureDetector>
	);
}

// --- "a swipe-back is in flight" ------------------------------------------------------------
// The bottom tab bar is hidden on detail routes and comes back when one is popped — a re-render
// that lands only once the navigation does, a beat after SwipeBackView's slide has finished. The
// screen underneath was seen settling and then being shoved as the bar appeared. Letting the bar
// know the swipe has begun brings it back with the slide instead of after it.
let swipingBack = false;
const swipeBackListeners = new Set<() => void>();
const setSwipingBack = (value: boolean) => {
	if (swipingBack === value) return;
	swipingBack = value;
	swipeBackListeners.forEach((fn) => fn());
};

/** True while a SwipeBackView drag is under way (the bottom tab bar watches this) */
export function useSwipingBack() {
	return useSyncExternalStore(
		(onChange) => {
			swipeBackListeners.add(onChange);
			return () => swipeBackListeners.delete(onChange);
		},
		() => swipingBack,
	);
}

/**
 * Pair for SwipeBackView on a `swipeBackScreenOptions` route. The route's own
 * `slide_from_right` is the *push* animation, and the native stack replays it in reverse when
 * the route is popped — on top of the slide SwipeBackView has already run. The screen below
 * was seen settling, then shifting again a beat later. Turning the route's animation off for
 * the duration of the swipe leaves exactly one.
 */
export function useSwipeBackPop(navigation: {
	setOptions: (options: { animation: "none" | "slide_from_right" }) => void;
}) {
	const onSwipeStart = useCallback(() => {
		setSwipingBack(true);
		navigation.setOptions({ animation: "none" });
	}, [navigation]);
	const onSwipeCancel = useCallback(() => {
		setSwipingBack(false);
		navigation.setOptions({ animation: "slide_from_right" });
	}, [navigation]);
	// Popped: the route itself now says the bar belongs on screen, so the override can go
	useEffect(() => () => setSwipingBack(false), []);
	return { onSwipeStart, onSwipeCancel };
}
