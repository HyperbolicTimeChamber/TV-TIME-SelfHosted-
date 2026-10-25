import { useSyncExternalStore } from "react";

/**
 * Seasons with a mark in flight, per show. Each season row keeps its own marking state, so a mark
 * started from one row that also covers other seasons (season speedster "Mark S1–Sn") showed the
 * spinner on the tapped row only — the other rows read this.
 */
const marking = new Map<number, Set<number>>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function startSeasonMarking(tmdbId: number, seasons: number[]) {
	marking.set(tmdbId, new Set([...(marking.get(tmdbId) ?? []), ...seasons]));
	emit();
}

export function endSeasonMarking(tmdbId: number, seasons: number[]) {
	const current = marking.get(tmdbId);
	if (!current) return;
	const next = new Set([...current].filter((s) => !seasons.includes(s)));
	if (next.size) marking.set(tmdbId, next);
	else marking.delete(tmdbId);
	emit();
}

const subscribe = (listener: () => void) => {
	listeners.add(listener);
	return () => listeners.delete(listener);
};

/** This season is being marked from another row of the same show */
export function useSeasonMarking(tmdbId: number, season: number): boolean {
	return useSyncExternalStore(subscribe, () => marking.get(tmdbId)?.has(season) ?? false);
}
