import { useEffect } from "react";
import { animate, useMotionValue, type MotionValue } from "motion/react";

const SNAP_SECONDS = 0.18;
/** No scroll event for this long = settled (browsers without `scrollend`) */
const SETTLE_MS = 120;

/**
 * Collapsing header ("diffClamp", app search header behaviour): returns the header's `y` in px,
 * which follows every scroll delta — y = clamp(prev - dy, -height, 0) — so it slides away with
 * the content and comes back proportionally on scroll up, then snaps fully shown/hidden once
 * scrolling stops. Drives a transform through a MotionValue: no React render per scroll event.
 * `locked` keeps it shown (e.g. while a popover anchored in the header is open).
 */
export function useCollapsingHeader(height: number, locked = false): MotionValue<number> {
	const y = useMotionValue(0);

	useEffect(() => {
		if (!height) return;
		// Height changed (layout / resize) — keep the offset in range
		if (y.get() < -height) y.jump(-height);

		const scrollTop = () => {
			// Clamp the rubber-band overscroll (iOS) so the bounce doesn't move the header
			const max = document.documentElement.scrollHeight - window.innerHeight;
			return Math.min(Math.max(window.scrollY, 0), Math.max(max, 0));
		};
		const supportsScrollEnd = "onscrollend" in window;
		let last = scrollTop();
		let settleTimer: ReturnType<typeof setTimeout> | undefined;

		const snap = () => {
			const cur = y.get();
			if (cur === 0 || cur === -height) return;
			// Only hide once the page is scrolled past the header, or its reserved space shows empty
			const hide = cur < -height / 2 && scrollTop() >= height;
			animate(y, hide ? -height : 0, { duration: SNAP_SECONDS, ease: "easeOut" });
		};

		const onScroll = () => {
			const top = scrollTop();
			const dy = top - last;
			last = top;
			if (locked) return;
			if (dy !== 0) {
				// jump() also stops a running snap
				y.jump(Math.min(0, Math.max(-height, y.get() - dy)));
			}
			if (!supportsScrollEnd) {
				clearTimeout(settleTimer);
				settleTimer = setTimeout(snap, SETTLE_MS);
			}
		};

		window.addEventListener("scroll", onScroll, { passive: true });
		if (supportsScrollEnd) window.addEventListener("scrollend", snap);
		if (locked) animate(y, 0, { duration: SNAP_SECONDS, ease: "easeOut" });
		return () => {
			clearTimeout(settleTimer);
			window.removeEventListener("scroll", onScroll);
			if (supportsScrollEnd) window.removeEventListener("scrollend", snap);
		};
	}, [height, locked, y]);

	return y;
}
