import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";

/** Starts after 25px sideways; turns past 60px or a flick */
const START_PX = 25;
const TURN_PX = 60;
const FLICK_VELOCITY = 500;

/**
 * Swipe between Watch List and Upcoming (RNGH, not the native pager — card gestures block
 * that). `dir` -1 = finger moves left, 1 = right. Cards activate at 10px, so their own swipes
 * (watched, Previously Watched's both ways) win; vertical scrolling fails this one.
 */
export function useTabSwipe(dir: -1 | 1, onSwipe: () => void) {
	return useMemo(
		() =>
			Gesture.Pan()
				.runOnJS(true)
				.activeOffsetX(dir * START_PX)
				.failOffsetY([-15, 15])
				.onEnd((e) => {
					if (e.translationX * dir > TURN_PX || e.velocityX * dir > FLICK_VELOCITY) onSwipe();
				}),
		[dir, onSwipe],
	);
}
