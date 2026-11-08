/** A Previously Watched row: an episode or a movie, ranked by when it was last watched */
export interface TimedItem {
	time: number;
}

const oldest = (list: TimedItem[]) => Math.min(...list.map((i) => i.time));
const ascending = <T extends TimedItem>(list: T[]) => [...list].sort((a, b) => a.time - b.time);

/**
 * Merge the loaded episode and movie history pages, oldest first, keeping only rows whose place
 * is confirmed: a row is safe when the other type has a fetched row older than it (nothing can
 * be missing in the gap) or that type has no more pages
 */
export function safeHistory<T extends TimedItem>(
	eps: T[],
	movies: T[],
	hasMoreEps: boolean,
	hasMoreMovies: boolean,
): T[] {
	// One type empty and fully loaded: all of the other
	if (eps.length === 0 && !hasMoreEps) return ascending(movies);
	if (movies.length === 0 && !hasMoreMovies) return ascending(eps);
	// One type empty with pages left: gaps might exist — nothing until a pull loads it
	if (eps.length === 0 || movies.length === 0) return [];

	let cutoff = -Infinity;
	if (hasMoreEps && hasMoreMovies) cutoff = Math.max(oldest(eps), oldest(movies));
	else if (hasMoreEps) cutoff = oldest(eps);
	else if (hasMoreMovies) cutoff = oldest(movies);
	return ascending([...eps, ...movies].filter((i) => i.time >= cutoff));
}

/**
 * The rows a cold start will show from the same history: it fetches only the first page of each
 * type (`epPageSize` / `moviePageSize` newest), while this session's pages may have grown past that (a mark adds its row to the
 * first page). The saved watchlist keeps only these — a saved row the fresh load doesn't have
 * vanished above the view once the live list took over, and the list jumped by a row
 */
export function coldStartHistory<T extends TimedItem>(
	eps: T[],
	movies: T[],
	hasMoreEps: boolean,
	hasMoreMovies: boolean,
	epPageSize: number,
	moviePageSize: number,
): T[] {
	const newest = (list: T[]) => [...list].sort((a, b) => b.time - a.time);
	const e = newest(eps);
	const m = newest(movies);
	return safeHistory(
		e.slice(0, epPageSize),
		m.slice(0, moviePageSize),
		hasMoreEps || e.length > epPageSize,
		hasMoreMovies || m.length > moviePageSize,
	);
}
