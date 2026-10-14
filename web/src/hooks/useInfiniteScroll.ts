import { useEffect, useRef } from "react";

/** Calls onEnd when the sentinel element nears the viewport (replaces onEndReached) */
export function useInfiniteScroll(onEnd: () => void, enabled: boolean) {
	const ref = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el || !enabled) return;
		const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && onEnd(), {
			rootMargin: "600px",
		});
		io.observe(el);
		return () => io.disconnect();
	}, [onEnd, enabled]);
	return ref;
}
