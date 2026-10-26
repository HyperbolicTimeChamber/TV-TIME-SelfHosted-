import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";

const DURATION_MS = 900;

/**
 * Counts from zero up to `value` once, the first time `run` is true and the number is real
 * (stats arrive async, so the first renders are zeros). After that run the value is followed
 * straight, so later changes just appear. Honours the system's reduce-motion setting.
 */
export function useCountUp(value: number, run: boolean, duration = DURATION_MS): number {
	const [display, setDisplay] = useState(value);
	const counted = useRef(false);
	const frame = useRef<number | null>(null);

	useEffect(() => {
		if (counted.current || !run || value <= 0) {
			setDisplay(value);
			return;
		}
		counted.current = true;
		let cancelled = false;

		AccessibilityInfo.isReduceMotionEnabled()
			.catch(() => false)
			.then((reduced) => {
				if (cancelled) return;
				if (reduced) {
					setDisplay(value);
					return;
				}
				const startedAt = Date.now();
				const tick = () => {
					const progress = Math.min((Date.now() - startedAt) / duration, 1);
					const eased = 1 - Math.pow(1 - progress, 3);
					setDisplay(Math.round(value * eased));
					if (progress < 1) frame.current = requestAnimationFrame(tick);
				};
				setDisplay(0);
				frame.current = requestAnimationFrame(tick);
			});

		return () => {
			cancelled = true;
			if (frame.current) cancelAnimationFrame(frame.current);
		};
	}, [value, run, duration]);

	return display;
}
