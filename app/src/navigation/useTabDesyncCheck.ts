import { useEffect, useRef } from "react";
import { AppState, type Animated } from "react-native";
import crashlytics from "@react-native-firebase/crashlytics";
import { TAB_DESYNC_SETTLE_MS, TAB_DESYNC_TOLERANCE } from "../enums";
import { trackTabDesync } from "../services/mixpanel";
import { isTabDesynced } from "../utils/tabDesync";

/**
 * Diagnostic only: once the app is back to `active` and has settled, compares the swipe pager's
 * position with the tab state; a mismatch is logged (Crashlytics breadcrumb + Mixpanel), once per
 * resume. Reads the position through a listener that lives only for the settle window and sets
 * no state, so it never renders
 */
export function useTabDesyncCheck(
	position: Animated.AnimatedInterpolation<number>,
	width: number,
	index: number,
): void {
	// Latest values read inside the timer, so the effect itself runs once
	const latest = useRef({ position, width, index });
	latest.current = { position, width, index };
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | null = null;
		let stopListening: (() => void) | null = null;
		const clear = () => {
			if (timer) clearTimeout(timer);
			stopListening?.();
			timer = null;
			stopListening = null;
		};
		const sub = AppState.addEventListener("change", (next) => {
			clear();
			if (next !== "active") return;
			const { position: pos } = latest.current;
			// The position's JS mirror only follows the native pager while something listens to it
			let seen: number | null = null;
			const id = pos.addListener(({ value }) => {
				seen = value;
			});
			stopListening = () => pos.removeListener(id);
			timer = setTimeout(() => {
				const { position: p, width: w, index: expected } = latest.current;
				const actual = seen ?? (p as unknown as { __getValue(): number }).__getValue();
				clear();
				if (!isTabDesynced(expected, actual, TAB_DESYNC_TOLERANCE)) return;
				const props = {
					expected_index: expected,
					actual_position: Math.round(actual * 1000) / 1000,
					offset: Math.round(actual * w),
					width: w,
					app_state: AppState.currentState,
				};
				crashlytics().log(`tab desync after resume: ${JSON.stringify(props)}`);
				trackTabDesync(props);
			}, TAB_DESYNC_SETTLE_MS);
		});
		return () => {
			sub.remove();
			clear();
		};
	}, []);
}
