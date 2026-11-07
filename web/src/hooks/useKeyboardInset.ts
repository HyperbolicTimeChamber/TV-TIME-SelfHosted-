import { useEffect, useState } from "react";

/** Smaller gaps are the browser's own bars sliding, not a keyboard */
const MIN_KEYBOARD_PX = 120;

/**
 * The on-screen keyboard (mobile browsers): how much of the bottom it covers and the height left
 * above it. Browsers lay out under the keyboard (only the visual viewport shrinks), so fixed
 * sheets have to move themselves. No keyboard → inset 0, room = the window's height
 */
export function useKeyboardInset(active = true) {
	const [state, setState] = useState({ inset: 0, room: 0 });
	useEffect(() => {
		const vv = window.visualViewport;
		if (!active || !vv) return;
		const update = () => {
			const covered = window.innerHeight - vv.height - vv.offsetTop;
			const inset = covered >= MIN_KEYBOARD_PX ? covered : 0;
			setState((s) =>
				s.inset === inset && s.room === vv.height ? s : { inset, room: inset ? vv.height : 0 },
			);
		};
		update();
		vv.addEventListener("resize", update);
		vv.addEventListener("scroll", update);
		return () => {
			vv.removeEventListener("resize", update);
			vv.removeEventListener("scroll", update);
		};
	}, [active]);
	return state;
}
