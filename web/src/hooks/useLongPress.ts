import { useCallback, useRef } from "react";

/**
 * Long-press for touch + mouse (500ms, like RN onLongPress); right-click also
 * triggers it on desktop. A long press suppresses the following click.
 */
export function useLongPress(onLongPress?: () => void, onPress?: () => void, delay = 500) {
	const timer = useRef<number | null>(null);
	const fired = useRef(false);

	const clear = useCallback(() => {
		if (timer.current) window.clearTimeout(timer.current);
		timer.current = null;
	}, []);

	const start = useCallback(() => {
		fired.current = false;
		if (!onLongPress) return;
		timer.current = window.setTimeout(() => {
			fired.current = true;
			onLongPress();
		}, delay);
	}, [onLongPress, delay]);

	return {
		onPointerDown: start,
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
