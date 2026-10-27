import * as Haptics from "expo-haptics";

/** Tap felt when a long press fires */
export function longPressHaptic() {
	Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Wrap a long-press handler so it buzzes first (undefined stays undefined) */
export function withHaptic<A extends unknown[]>(
	fn?: (...args: A) => void,
): ((...args: A) => void) | undefined {
	if (!fn) return undefined;
	return (...args: A) => {
		longPressHaptic();
		fn(...args);
	};
}
