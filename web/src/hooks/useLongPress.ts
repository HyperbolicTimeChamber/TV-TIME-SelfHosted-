import { useCallback, useRef } from "react";

/** Finger / mouse travel that turns a press into a drag or scroll (cancels the long press) */
const MOVE_CANCEL_PX = 10;

/** Short buzz where the browser supports it (Android Chrome; iOS Safari ignores it) — app haptic twin */
function vibrate() {
	navigator.vibrate?.(15);
}

/**
 * Long-press for touch + mouse (500ms, like RN onLongPress); right-click also
 * triggers it on desktop. A long press suppresses the following click.
 */
export function useLongPress(onLongPress?: () => void, onPress?: () => void, delay = 500) {
	const timer = useRef<number | null>(null);
	const fired = useRef(false);
	const origin = useRef<{ x: number; y: number } | null>(null);

	const clear = useCallback(() => {
		if (timer.current) window.clearTimeout(timer.current);
		timer.current = null;
	}, []);

	const start = useCallback(
		(e: React.PointerEvent) => {
			fired.current = false;
			if (!onLongPress) return;
			origin.current = { x: e.clientX, y: e.clientY };
			timer.current = window.setTimeout(() => {
				fired.current = true;
				vibrate();
				onLongPress();
			}, delay);
		},
		[onLongPress, delay],
	);

	return {
		onPointerDown: start,
		onPointerMove: (e: React.PointerEvent) => {
			const o = origin.current;
			if (o && timer.current && Math.hypot(e.clientX - o.x, e.clientY - o.y) > MOVE_CANCEL_PX) clear();
		},
		onPointerUp: clear,
		onPointerLeave: clear,
		onPointerCancel: clear,
		onContextMenu: (e: React.MouseEvent) => {
			if (!onLongPress) return;
			e.preventDefault();
			clear();
			fired.current = true;
			onLongPress();
		},
		onClick: (e: React.MouseEvent) => {
			if (fired.current) {
				fired.current = false;
				e.stopPropagation();
				return;
			}
			onPress?.();
		},
	};
}
