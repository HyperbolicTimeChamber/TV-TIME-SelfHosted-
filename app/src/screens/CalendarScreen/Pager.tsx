import { useCallback, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

/** Drag past this share of the width (or flick) to turn the page */
const TURN_SHARE = 0.22;
const FLICK_VELOCITY = 600;
const TURN_MS = 200;

interface Props {
	width: number;
	/** Changes when the centre page changes — resets the strip without a jump */
	pageKey: string;
	/** -1 previous, 0 current, 1 next */
	renderPage: (offset: -1 | 0 | 1) => ReactNode;
	/** Swiped to the next (1) or previous (-1) page */
	onPage: (dir: 1 | -1) => void;
	/** Another gesture racing this one (e.g. the calendar's vertical resize) */
	race?: GestureType;
	style?: StyleProp<ViewStyle>;
}

/**
 * Horizontal 3-page swiper: previous / current / next sit side by side and follow the
 * finger; letting go past the threshold slides to the neighbour and reports it, then the
 * parent re-centres by changing pageKey.
 */
export default function Pager({ width, pageKey, renderPage, onPage, race, style }: Props) {
	const tx = useSharedValue(0);
	// Gestures are built once (rebuilding mid-swipe drops their callbacks), so the latest
	// onPage is read through a ref
	const onPageRef = useRef(onPage);
	onPageRef.current = onPage;
	const turn = useCallback((dir: 1 | -1) => onPageRef.current(dir), []);

	// New centre page rendered → put the strip back in the middle
	useLayoutEffect(() => {
		tx.value = 0;
	}, [pageKey, tx]);

	const pan = useMemo(
		() =>
			Gesture.Pan()
		.activeOffsetX([-14, 14])
		.failOffsetY([-12, 12])
		.onUpdate((e) => {
			tx.value = e.translationX;
		})
		.onEnd((e) => {
			const next = e.translationX < -width * TURN_SHARE || e.velocityX < -FLICK_VELOCITY;
			const prev = e.translationX > width * TURN_SHARE || e.velocityX > FLICK_VELOCITY;
			if (!next && !prev) {
				tx.value = withTiming(0, { duration: TURN_MS });
				return;
			}
			const dir = next ? 1 : -1;
			tx.value = withTiming(-dir * width, { duration: TURN_MS }, (finished) => {
				if (finished) runOnJS(turn)(dir);
			});
		}),
		[width, tx, turn],
	);
	const gesture = useMemo(() => (race ? Gesture.Race(pan, race) : pan), [pan, race]);

	const strip = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

	return (
		<GestureDetector gesture={gesture}>
			<View style={[styles.clip, style]}>
				<Animated.View style={[StyleSheet.absoluteFill, strip]}>
					{([-1, 0, 1] as const).map((offset) => (
						<View key={offset} style={[StyleSheet.absoluteFill, { left: offset * width, right: -offset * width }]}>
							{renderPage(offset)}
						</View>
					))}
				</Animated.View>
			</View>
		</GestureDetector>
	);
}

const styles = StyleSheet.create({
	clip: { overflow: "hidden" },
});
