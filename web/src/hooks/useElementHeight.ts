import { useEffect, useRef, useState } from "react";

/** Live height of an element (fixed headers reserve their own space) */
export function useElementHeight<T extends HTMLElement>() {
	const ref = useRef<T | null>(null);
	const [height, setHeight] = useState(0);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => setHeight(entry.target.getBoundingClientRect().height));
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	return [ref, height] as const;
}
