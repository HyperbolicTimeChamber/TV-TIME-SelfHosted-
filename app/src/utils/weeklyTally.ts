/** Watches per day, as the Profile charts show them */
export interface DayTally {
	episodes: number;
	movies: number;
}

interface Watched {
	lastWatchedAt?: unknown;
}

/**
 * Count watched episodes and movies per day (`dayOf` turns a stamp into a day key). Bulk marks
 * are spread back to back by markSeasonWatched (see utils/stagger), so a long catch-up falls
 * across the days it would have taken rather than piling onto one.
 */
export function tallyWeek(
	episodes: Watched[],
	movies: Watched[],
	dayOf: (stamp: unknown) => string | null,
): Record<string, DayTally> {
	const days: Record<string, DayTally> = {};
	const bump = (w: Watched, kind: keyof DayTally) => {
		const day = dayOf(w.lastWatchedAt);
		if (!day) return;
		const entry = days[day] ?? { episodes: 0, movies: 0 };
		entry[kind]++;
		days[day] = entry;
	};
	for (const e of episodes) bump(e, "episodes");
	for (const m of movies) bump(m, "movies");
	return days;
}
