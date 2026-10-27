import { useEffect, useRef, useState } from "react";

/** Live width of an element */
export function useElementWidth<T extends HTMLElement>() {
	const ref = useRef<T | null>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) =>
			setWidth(entry.target.getBoundingClientRect().width),
		);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);
	return [ref, width] as const;
}
