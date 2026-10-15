import { useEffect, useState } from "react";

/** Hide a header on scroll down, reveal on scroll up (app search header behaviour) */
export function useCollapsingHeader(threshold = 50) {
	const [visible, setVisible] = useState(true);
	useEffect(() => {
		let last = window.scrollY;
		const onScroll = () => {
			const y = window.scrollY;
			const dy = y - last;
			last = y;
			if (dy > 10 && y > threshold) setVisible(false);
			// Back at the top always shows it — a short page may not scroll up far enough to trigger dy
			else if (dy < -10 || y <= 0) setVisible(true);
		};
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, [threshold]);
	return visible;
}
