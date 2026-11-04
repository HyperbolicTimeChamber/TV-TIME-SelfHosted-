import { HISTORY_KEYWORD_SUGGESTIONS, HistoryFilter, type FilterAlias } from "../enums";
import type { HistoryFacets } from "../types";
import {
	HISTORY_FILTERS,
	HISTORY_FILTER_LABEL,
	availableFacets,
	countryLabel,
	filterAliasFor,
	type FacetIndex,
} from "./historyView";

/** Countries / studios listed before "More": the most common ones (picked ones always show) */
export const COUNTRY_SUGGESTIONS = 8;
export const STUDIO_SUGGESTIONS = 8;
/** "More" adds this many each tap — the long tail stays reachable by typing its name */
export const STUDIO_MORE_STEP = 16;

export interface FacetOptions {
	genres: string[];
	keywords: string[];
	countries: string[];
	studios: string[];
}

export interface FilterSectionsInput {
	/** The filter search, as typed */
	term: string;
	filters: ReadonlySet<HistoryFilter>;
	facets: HistoryFacets;
	/** Every value across the tab's tracked titles (the facets doc) */
	options: FacetOptions;
	/** facets/{mediaType}Index — null while not loaded / never built (then nothing narrows) */
	index: FacetIndex | null | undefined;
	allCountries: boolean;
	studioLimit: number;
}

/** A regional genre typed ("k drama"): the country + genre one chip turns on together */
export interface RegionApply {
	alias: FilterAlias;
	countries: string[];
	genres: string[];
}

export interface FilterSections {
	statuses: HistoryFilter[];
	genres: string[];
	countries: string[];
	moreCountries: boolean;
	studios: string[];
	moreStudios: boolean;
	keywords: { picked: string[]; rest: string[] };
	region: RegionApply | null;
}

/**
 * What the sort / filter drawer lists (app HistoryViewSheet, web HistoryViewPanel):
 * - picked chips always show;
 * - the rest only when some title still carries them next to the picks in the other sections
 *   (facet index) — a combination that matches nothing can't be built;
 * - the search narrows every section to labels holding the text, plus what an alias means
 *   ("k drama" → South Korea + Drama, "sci fi" → the Sci-Fi genres).
 */
export function buildFilterSections({
	term,
	filters,
	facets,
	options,
	index,
	allCountries,
	studioLimit,
}: FilterSectionsInput): FilterSections {
	const typed = term.trim().toLowerCase();
	const alias = typed ? filterAliasFor(typed) : undefined;
	const available = availableFacets(index, facets);
	const ok = (key: keyof HistoryFacets, v: string) => !available || available[key].has(v);
	const hasText = (label: string) => !typed || label.toLowerCase().includes(typed);
	const merged = (picked: ReadonlySet<string>, all: string[]) => [...new Set([...picked, ...all])];

	const statuses = HISTORY_FILTERS.filter(
		(f) => filters.has(f) || hasText(HISTORY_FILTER_LABEL[f]),
	);

	const genres = merged(facets.genres, options.genres).filter(
		(g) =>
			facets.genres.has(g) || (ok("genres", g) && (hasText(g) || !!alias?.genres?.includes(g))),
	);

	const liveCountries = options.countries.filter((c) => ok("countries", c));
	let countries: string[];
	if (typed) {
		countries = merged(facets.countries, liveCountries).filter(
			(c) => facets.countries.has(c) || hasText(countryLabel(c)) || !!alias?.countries?.includes(c),
		);
	} else {
		countries = merged(
			facets.countries,
			allCountries ? liveCountries : liveCountries.slice(0, COUNTRY_SUGGESTIONS),
		);
	}
	const moreCountries = !typed && !allCountries && liveCountries.length > COUNTRY_SUGGESTIONS;

	const liveStudios = options.studios.filter((st) => ok("studios", st));
	const studios = typed
		? merged(facets.studios, liveStudios).filter((st) => facets.studios.has(st) || hasText(st))
		: merged(facets.studios, liveStudios.slice(0, studioLimit));
	const moreStudios = !typed && liveStudios.length > studioLimit;

	// Only keywords the user's titles carry — nothing made up from the typed text
	const pickedKeywords = [...facets.keywords];
	const restKeywords = options.keywords
		.filter(
			(k) =>
				!facets.keywords.has(k) &&
				ok("keywords", k) &&
				(!typed || k.includes(typed) || !!alias?.keywords?.includes(k)),
		)
		.slice(0, HISTORY_KEYWORD_SUGGESTIONS);

	return {
		statuses,
		genres,
		countries,
		moreCountries,
		studios,
		moreStudios,
		keywords: { picked: pickedKeywords, rest: restKeywords },
		region: alias ? regionApply(alias, facets, options, index) : null,
	};
}

/**
 * The one-tap chip for a regional genre: its countries the user has titles from, and its genres
 * that still match once those countries are on (else just the countries) — never a dead combo.
 * null when no title of the user's is from there.
 */
function regionApply(
	alias: FilterAlias,
	facets: HistoryFacets,
	options: FacetOptions,
	index: FacetIndex | null | undefined,
): RegionApply | null {
	if (!alias.countries?.length) return null;
	const now = availableFacets(index, facets);
	const countries = alias.countries.filter(
		(c) => options.countries.includes(c) && (!now || now.countries.has(c)),
	);
	if (countries.length === 0) return null;
	const withCountries = availableFacets(index, {
		...facets,
		countries: new Set([...facets.countries, ...countries]),
	});
	const genres = (alias.genres ?? []).filter(
		(g) => options.genres.includes(g) && (!withCountries || withCountries.genres.has(g)),
	);
	return { alias, countries, genres };
}
