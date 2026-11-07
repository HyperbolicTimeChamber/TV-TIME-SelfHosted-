import { useCallback, useEffect, useRef } from "react";
import { HEAL_VIEW_DWELL_MS } from "../enums";

/**
 * Cards on screen → `heal` for the ones that stay in view HEAL_VIEW_DWELL_MS (a card flung past
 * is never healed). Call the returned function with every visible card's tmdbId each time the
 * visible set changes (app: LegendList onViewableItemsChanged; web: IntersectionObserver).
 */
export function useHealOnView(heal: (tmdbIds: number[]) => void) {
	const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
	const healRef = useRef(heal);
	healRef.current = heal;
	useEffect(() => {
		const pending = timers.current;
		return () => {
			pending.forEach(clearTimeout);
			pending.clear();
		};
	}, []);
	return useCallback((visible: number[]) => {
		const now = new Set(visible);
		for (const [id, t] of timers.current) {
			if (!now.has(id)) {
				clearTimeout(t);
				timers.current.delete(id);
			}
		}
		for (const id of now) {
			if (timers.current.has(id)) continue;
			timers.current.set(
				id,
				setTimeout(() => {
					timers.current.delete(id);
					healRef.current([id]);
				}, HEAL_VIEW_DWELL_MS),
			);
		}
	}, []);
}
