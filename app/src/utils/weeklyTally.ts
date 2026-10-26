/** Watches per day, as the Profile charts show them */
export interface DayTally {
	episodes: number;
	movies: number;
}

interface Watched {
	lastWatchedAt?: unknown;
	/** Minutes; 0 / missing when TMDB didn't know */
	runtime?: number;
}

/** Nobody watches more than this in a day */
const DAY_MINUTES = 24 * 60;
/** Stand-ins for a watch whose runtime isn't known */
const EPISODE_MINUTES = 45;
const MOVIE_MINUTES = 120;

/** Same time to the nanosecond, or null when it isn't a Timestamp */
const stampKey = (stamp: any): string | null =>
	typeof stamp?.seconds === "number" ? `${stamp.seconds}.${stamp.nanoseconds ?? 0}` : null;

/**
 * Count watched episodes and movies per day (`dayOf` turns a stamp into a day key), capping
 * each day at 24 hours of watch time.
 *
 * Bulk marks (a whole season, everything up to an episode, a rewatch range, Woah There
 * Speedster's "mark all") stamp every episode with one shared time, so marking a long season
 * put things like 89 episodes on a single day. Small bulk marks are real catch-ups and still
 * count; the cap just keeps a day possible. Single marks (each stamped on its own) and movies
 * fill the day first, then bulk-marked episodes take whatever time is left.
 */
export function tallyWeek(
	episodes: Watched[],
	movies: Watched[],
	dayOf: (stamp: unknown) => string | null,
): Record<string, DayTally> {
	const perStamp = new Map<string, number>();
	for (const e of episodes) {
		const key = stampKey(e.lastWatchedAt);
		if (key) perStamp.set(key, (perStamp.get(key) ?? 0) + 1);
	}
	const isBulk = (e: Watched) => {
		const key = stampKey(e.lastWatchedAt);
		return !!key && (perStamp.get(key) ?? 0) > 1;
	};

	const days: Record<string, DayTally> = {};
	const minutes: Record<string, number> = {};
	const add = (w: Watched, kind: keyof DayTally, fallback: number) => {
		const day = dayOf(w.lastWatchedAt);
		if (!day) return;
		const length = w.runtime || fallback;
		if ((minutes[day] ?? 0) + length > DAY_MINUTES) return;
		minutes[day] = (minutes[day] ?? 0) + length;
		const entry = days[day] ?? { episodes: 0, movies: 0 };
		entry[kind]++;
		days[day] = entry;
	};
	for (const m of movies) add(m, "movies", MOVIE_MINUTES);
	for (const e of episodes) if (!isBulk(e)) add(e, "episodes", EPISODE_MINUTES);
	for (const e of episodes) if (isBulk(e)) add(e, "episodes", EPISODE_MINUTES);
	return days;
}
