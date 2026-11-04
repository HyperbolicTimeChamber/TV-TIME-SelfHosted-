import { useCallback, useEffect, useRef } from "react";

/**
 * Which cards are on screen (half or more in view), reported as tmdbIds every time that set
 * changes — app WatchlistTab's onViewableItemsChanged. Give each card `ref={observe(tmdbId)}`.
 */
export function useVisibleCards(onVisible: (tmdbIds: number[]) => void) {
	const onVisibleRef = useRef(onVisible);
	onVisibleRef.current = onVisible;
	const visible = useRef(new Set<number>());
	const ids = useRef(new WeakMap<Element, number>());
	const observer = useRef<IntersectionObserver | null>(null);
	if (!observer.current && typeof IntersectionObserver !== "undefined") {
		observer.current = new IntersectionObserver(
			(entries) => {
				let changed = false;
				for (const e of entries) {
					const id = ids.current.get(e.target);
					if (id === undefined) continue;
					if (e.isIntersecting && !visible.current.has(id)) {
						visible.current.add(id);
						changed = true;
					} else if (!e.isIntersecting && visible.current.delete(id)) {
						changed = true;
					}
				}
				if (changed) onVisibleRef.current([...visible.current]);
			},
			{ threshold: 0.5 },
		);
	}
	useEffect(() => () => observer.current?.disconnect(), []);
	return useCallback(
		(tmdbId: number) => (el: Element | null) => {
			if (!el || !observer.current) return;
			ids.current.set(el, tmdbId);
			observer.current.observe(el);
		},
		[],
	);
}
