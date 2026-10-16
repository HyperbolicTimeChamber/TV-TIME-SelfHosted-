import { useCallback, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

/** Drag past this share of the width (or flick) to turn the page */
const TURN_SHARE = 0.22;
const FLICK_VELOCITY = 600;
const TURN_MS = 200;
const OFFSETS = [-1, 0, 1] as const;

interface Props {
	width: number;
	/** Absolute position of the centre page (day / week / month number) — pages sit at
	 *  index × width, so turning a page needs no re-centring (no flicker) */
	index: number;
	/** Stable identity of the page at an offset (e.g. its date) — a page keeps its views
	 *  (and loaded images) as it moves from "next" to "current" */
	keyFor: (offset: -1 | 0 | 1) => string;
	/** -1 previous, 0 current, 1 next */
	renderPage: (offset: -1 | 0 | 1) => ReactNode;
	/** Swiped to the next (1) or previous (-1) page */
	onPage: (dir: 1 | -1) => void;
	/** A sideways drag began (e.g. load the neighbour pages) */
	onDragStart?: () => void;
	/** Another gesture racing this one (e.g. the calendar's vertical scroll) */
	race?: GestureType;
	style?: StyleProp<ViewStyle>;
}

/**
 * Horizontal 3-page swiper: previous / current / next follow the finger; letting go past the
 * threshold slides to the neighbour and reports it. The strip already rests where the new
 * centre page lives, so the parent's re-render doesn't move anything.
 */
export default function Pager({
	width,
	index: absIndex,
	keyFor,
	renderPage,
	onPage,
	onDragStart,
	race,
	style,
}: Props) {
	// Positions count from a nearby anchor so pixel offsets stay small (a day number × width
	// would run into the millions); re-anchored after a big jump (that snaps anyway)
	const anchor = useRef(absIndex);
	if (Math.abs(absIndex - anchor.current) > 500) anchor.current = absIndex;
	const index = absIndex - anchor.current;
	const base = useSharedValue(-index * width);
	const tx = useSharedValue(-index * width);
	// Gestures are built once (rebuilding mid-swipe drops their callbacks), so the latest
	// onPage is read through a ref
	const onPageRef = useRef(onPage);
	onPageRef.current = onPage;
	const turn = useCallback((dir: 1 | -1) => onPageRef.current(dir), []);
	const onDragStartRef = useRef(onDragStart);
	onDragStartRef.current = onDragStart;
	const dragStarted = useCallback(() => onDragStartRef.current?.(), []);

	// Centre moved: after a swipe the strip is already there (no-op); after a jump (today,
	// tapped day in another month) it snaps to the new spot
	useLayoutEffect(() => {
		base.value = -index * width;
		tx.value = -index * width;
	}, [index, width, base, tx]);

	const pan = useMemo(
		() =>
			Gesture.Pan()
				.activeOffsetX([-14, 14])
				.failOffsetY([-12, 12])
				.onStart(() => {
					runOnJS(dragStarted)();
				})
				.onUpdate((e) => {
					tx.value = base.value + e.translationX;
				})
				.onEnd((e) => {
					const next = e.translationX < -width * TURN_SHARE || e.velocityX < -FLICK_VELOCITY;
					const prev = e.translationX > width * TURN_SHARE || e.velocityX > FLICK_VELOCITY;
					if (!next && !prev) {
						tx.value = withTiming(base.value, { duration: TURN_MS });
						return;
					}
					const dir = next ? 1 : -1;
					tx.value = withTiming(base.value - dir * width, { duration: TURN_MS }, (finished) => {
						if (finished) runOnJS(turn)(dir);
					});
				}),
		[width, base, tx, turn, dragStarted],
	);
	const gesture = useMemo(() => (race ? Gesture.Race(pan, race) : pan), [pan, race]);

	const strip = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

	return (
		<GestureDetector gesture={gesture}>
			<View style={[styles.clip, style]}>
				<Animated.View style={[StyleSheet.absoluteFill, strip]}>
					{OFFSETS.map((offset) => (
						<View
							key={keyFor(offset)}
							style={[styles.page, { width, left: (index + offset) * width }]}
						>
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
	page: { position: "absolute", top: 0, bottom: 0 },
});
