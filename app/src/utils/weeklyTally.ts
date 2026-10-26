/** Watches per day, as the Profile charts show them */
export interface DayTally {
	episodes: number;
	movies: number;
}

interface Watched {
	lastWatchedAt?: unknown;
}

/** Same time to the nanosecond, or null when it isn't a Timestamp */
const stampKey = (stamp: any): string | null =>
	typeof stamp?.seconds === "number" ? `${stamp.seconds}.${stamp.nanoseconds ?? 0}` : null;

/**
 * Count watched episodes and movies per day (`dayOf` turns a stamp into a day key).
 *
 * Bulk marks (a whole season, everything up to an episode, a rewatch range — from the show
 * page or the markSeasonWatched function) stamp every episode with one shared time, which put
 * things like 89 episodes on a single day. A single mark is stamped by the server, so its time
 * is its own. Episodes sharing a stamp were marked in bulk and are left out.
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
	const isBulk = (stamp: unknown) => {
		const key = stampKey(stamp);
		return !!key && (perStamp.get(key) ?? 0) > 1;
	};

	const days: Record<string, DayTally> = {};
	const bump = (stamp: unknown, kind: keyof DayTally) => {
		const day = dayOf(stamp);
		if (!day) return;
		const entry = days[day] ?? { episodes: 0, movies: 0 };
		entry[kind]++;
		days[day] = entry;
	};
	for (const e of episodes) if (!isBulk(e.lastWatchedAt)) bump(e.lastWatchedAt, "episodes");
	for (const m of movies) bump(m.lastWatchedAt, "movies");
	return days;
}
