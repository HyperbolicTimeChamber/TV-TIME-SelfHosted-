import { COUNTRY_NAMES, HistoryFilter, HistorySort, REGION_ALIASES, WatchStatus } from "../enums";
import type { HistoryEntry, HistoryFacets } from "../types";

export const NO_FACETS: HistoryFacets = {
	genres: new Set(),
	keywords: new Set(),
	countries: new Set(),
	studios: new Set(),
};

export const hasFacets = (f: HistoryFacets) =>
	f.genres.size > 0 || f.keywords.size > 0 || f.countries.size > 0 || f.studios.size > 0;

const anyOf = (picked: ReadonlySet<string>, values: string[] | undefined) =>
	picked.size === 0 || (values ?? []).some((v) => picked.has(v));

/** Client side of a filtered view: the status filter and both facets (Firestore runs one of them) */
export function matchesHistoryView(
	entry: HistoryEntry,
	statuses: WatchStatus[],
	facets: HistoryFacets,
): boolean {
	return (
		(statuses.length === 0 || statuses.includes(entry.status)) &&
		anyOf(facets.genres, entry.genres) &&
		anyOf(facets.keywords, entry.keywords) &&
		anyOf(facets.countries, entry.countries) &&
		anyOf(facets.studios, entry.studios)
	);
}

/** users/{uid}/facets/{mediaType}: value → how many tracked titles carry it */
export interface UserFacetsDoc {
	genres?: Record<string, number>;
	keywords?: Record<string, number>;
	countries?: Record<string, number>;
	studios?: Record<string, number>;
}

/** One title's genres + keywords + origin countries + studios */
export interface TitleFacets {
	genres: string[];
	keywords: string[];
	countries: string[];
	studios: string[];
}

/** What an addShow / removeShow call did to the facets doc (functions FacetDelta) */
export interface FacetDelta {
	remove: TitleFacets | null;
	add: TitleFacets | null;
}

/** The functions' applyFacetDelta: a title's values leave / arrive, values at 0 are dropped */
export function applyFacetDelta(
	current: UserFacetsDoc | undefined,
	remove: Partial<TitleFacets> | null,
	add: Partial<TitleFacets> | null,
): Required<UserFacetsDoc> {
	const step = (counts: Record<string, number> | undefined, out: string[] = [], inn: string[] = []) => {
		const next: Record<string, number> = { ...(counts ?? {}) };
		for (const v of new Set(out)) next[v] = (next[v] ?? 0) - 1;
		for (const v of new Set(inn)) next[v] = (next[v] ?? 0) + 1;
		for (const [v, n] of Object.entries(next)) if (!(n > 0)) delete next[v];
		return next;
	};
	return {
		genres: step(current?.genres, remove?.genres, add?.genres),
		keywords: step(current?.keywords, remove?.keywords, add?.keywords),
		countries: step(current?.countries, remove?.countries, add?.countries),
		studios: step(current?.studios, remove?.studios, add?.studios),
	};
}

/** The facets doc → genres A–Z, keywords and countries most common first (map keys: never
 *  duplicated) */
export function facetOptionsFromDoc(doc: UserFacetsDoc | null | undefined): {
	genres: string[];
	keywords: string[];
	countries: string[];
	studios: string[];
} {
	const live = (m: Record<string, number> | undefined) =>
		Object.entries(m ?? {}).filter(([, n]) => n > 0);
	const byCount = (m: Record<string, number> | undefined) =>
		live(m)
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.map(([v]) => v);
	return {
		genres: live(doc?.genres)
			.map(([g]) => g)
			.sort((a, b) => a.localeCompare(b)),
		keywords: byCount(doc?.keywords),
		countries: byCount(doc?.countries),
		studios: byCount(doc?.studios),
	};
}

export const HISTORY_SORTS: HistorySort[] = [HistorySort.LAST_WATCHED, HistorySort.TIME_SPENT];

export const HISTORY_SORT_LABEL: Record<HistorySort, string> = {
	[HistorySort.LAST_WATCHED]: "Last watched",
	[HistorySort.TIME_SPENT]: "Total time spent",
};

export const HISTORY_FILTERS: HistoryFilter[] = [
	HistoryFilter.PAUSED,
	HistoryFilter.WATCHING,
	HistoryFilter.REWATCHING,
];

export const HISTORY_FILTER_LABEL: Record<HistoryFilter, string> = {
	[HistoryFilter.PAUSED]: "Paused",
	[HistoryFilter.WATCHING]: "Currently watching",
	[HistoryFilter.REWATCHING]: "Rewatching",
};

const FILTER_STATUSES: Record<HistoryFilter, WatchStatus[]> = {
	[HistoryFilter.PAUSED]: [WatchStatus.PAUSED, WatchStatus.PAUSED_REWATCH],
	[HistoryFilter.WATCHING]: [WatchStatus.WATCHING, WatchStatus.PLAN_TO_WATCH],
	[HistoryFilter.REWATCHING]: [WatchStatus.REWATCHING],
};

/** Tracking statuses a filter set matches (empty = no status filter) — for a Firestore `in` */
export function historyFilterStatuses(filters: ReadonlySet<HistoryFilter>): WatchStatus[] {
	return HISTORY_FILTERS.filter((f) => filters.has(f)).flatMap((f) => FILTER_STATUSES[f]);
}

/** Default view (newest watch first, no filters) uses the cached, delta-synced list */
export function isDefaultHistoryView(
	sort: HistorySort,
	filters: ReadonlySet<HistoryFilter>,
	facets: HistoryFacets = NO_FACETS,
): boolean {
	return sort === HistorySort.LAST_WATCHED && filters.size === 0 && !hasFacets(facets);
}

/** Several history tabs (TV, movies) as one: the most recently watched first, at most `limit` */
export function latestEntries(tabs: HistoryEntry[][], limit: number): HistoryEntry[] {
	return tabs
		.flat()
		.sort((a, b) => b.historyAt - a.historyAt)
		.slice(0, limit);
}

const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** The regional genre a typed keyword names ("K Drama" → K-Drama: KR + Drama), if any */
export function regionAliasFor(text: string) {
	return REGION_ALIASES[squash(text)];
}

/** A country chip: flag + name ("🇰🇷 South Korea"), the bare code when the name isn't known */
export function countryLabel(code: string) {
	const flag = /^[A-Z]{2}$/.test(code)
		? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
		: "";
	return `${flag} ${COUNTRY_NAMES[code] ?? code}`.trim();
}
