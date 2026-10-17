import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";

/** Starts after 25px sideways; turns past 60px or a flick */
const START_PX = 25;
const TURN_PX = 60;
const FLICK_VELOCITY = 500;

/**
 * Sideways swipe on a Home tab (RNGH — the bottom pager's swipe is off on Home, card
 * gestures would block it). onLeft = finger moves left, onRight = right; a missing side never
 * activates. Cards activate at 10px, so their swipes (watched, Previously Watched's both
 * ways) win; vertical scrolling fails this one.
 */
export function useTabSwipe({ onLeft, onRight }: { onLeft?: () => void; onRight?: () => void }) {
	return useMemo(() => {
		// One side only → a single offset (that direction alone activates)
		const start: number | [number, number] =
			onLeft && onRight ? [-START_PX, START_PX] : onLeft ? -START_PX : START_PX;
		return Gesture.Pan()
			.runOnJS(true)
			.activeOffsetX(start)
			.failOffsetY([-15, 15])
			.onEnd((e) => {
				if (onLeft && (e.translationX < -TURN_PX || e.velocityX < -FLICK_VELOCITY)) onLeft();
				else if (onRight && (e.translationX > TURN_PX || e.velocityX > FLICK_VELOCITY)) onRight();
			});
	}, [onLeft, onRight]);
}
