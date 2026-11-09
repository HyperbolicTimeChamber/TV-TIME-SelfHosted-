import {
  MediaType,
  SearchScope,
  SEARCH_FRANCHISE_SEEDS,
  SEARCH_PERSON_MAX_CHECKS,
  SEARCH_PERSON_NAME_MAX_WORDS,
  SEARCH_YEAR_AHEAD,
  SEARCH_YEAR_MIN,
} from "../../shared/enums";
import type { SearchTitle, SearchTitlesResponse } from "../../shared/types";
import { mergeSearchPages, type TmdbSearchPage } from "./mergeSearchPages";

export interface RefineDeps {
  tmdbGet: <T>(path: string, params: Record<string, string | number>) => Promise<T>;
  /** First batch of an ordinary search (shares its cache) */
  search: (scope: SearchScope, query: string) => Promise<SearchTitlesResponse>;
}

interface PersonCredits {
  cast: Record<string, unknown>[];
  crew: Record<string, unknown>[];
}

const YEAR_SEARCHES: { scope: SearchScope; path: string; yearParam: string }[] = [
  { scope: SearchScope.MOVIE, path: "/search/movie", yearParam: "primary_release_year" },
  { scope: SearchScope.TV, path: "/search/tv", yearParam: "first_air_date_year" },
];

export const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

const titleKey = (t: SearchTitle) => `${t.media_type}_${t.id}`;

const namesOf = (t: SearchTitle) =>
  [t.title, t.name, t.original_title, t.original_name].filter(
    (n): n is string => typeof n === "string",
  );

/** Every word of `query` is in the title; "spiderman" also finds "Spider-Man" */
export function titleMatches(title: SearchTitle, query: string): boolean {
  const wanted = words(query);
  if (wanted.length === 0) return false;
  return namesOf(title).some((name) => {
    const have = words(name);
    return (
      wanted.every((w) => have.includes(w)) || have.join("").includes(wanted.join(""))
    );
  });
}

/** A year among other words ("batman 2006"); the last one when there are several */
export function splitYear(
  terms: string[],
  now = new Date(),
): { year: number | null; rest: string[] } {
  const latest = now.getFullYear() + SEARCH_YEAR_AHEAD;
  for (let i = terms.length - 1; i >= 0; i--) {
    const year = /^\d{4}$/.test(terms[i]) ? Number(terms[i]) : 0;
    if (terms.length > 1 && year >= SEARCH_YEAR_MIN && year <= latest) {
      return { year, rest: terms.filter((_, j) => j !== i) };
    }
  }
  return { year: null, rest: terms };
}

/**
 * Ways the words divide into a title and a person, likeliest first: a full name at the end, a
 * longer name, a surname, then the same with the person first ("christian bale batman")
 */
export function personSplits(terms: string[]): { title: string; person: string }[] {
  const lengths = [2, SEARCH_PERSON_NAME_MAX_WORDS, 1].filter((n) => n < terms.length);
  const atEnd = lengths.map((n) => ({
    title: terms.slice(0, -n).join(" "),
    person: terms.slice(-n).join(" "),
  }));
  const atStart = lengths.map((n) => ({
    title: terms.slice(n).join(" "),
    person: terms.slice(0, n).join(" "),
  }));
  return [...atEnd, ...atStart];
}

const yearOf = (t: SearchTitle) => {
  const date = t.release_date ?? t.first_air_date;
  const year = typeof date === "string" ? Number(date.slice(0, 4)) : 0;
  return year || null;
};

/** Stable: that year's titles first in their own order, then the closest years */
export function byYear(titles: SearchTitle[], year: number | null): SearchTitle[] {
  if (year === null) return titles;
  const distance = (t: SearchTitle) => {
    const y = yearOf(t);
    return y === null ? Number.MAX_SAFE_INTEGER : Math.abs(y - year);
  };
  return [...titles].sort((a, b) => distance(a) - distance(b));
}

const popularity = (t: SearchTitle) => (typeof t.popularity === "number" ? t.popularity : 0);

function creditedInScope(credits: PersonCredits, scope: SearchScope): SearchTitle[] {
  // Someone who both directed and wrote a film is listed once per job: the merge keeps one
  const merged = mergeSearchPages(
    [
      {
        page: 1,
        results: [...credits.cast, ...credits.crew],
        total_pages: 1,
        total_results: 0,
      },
    ],
    SearchScope.ALL,
  );
  return merged.filter(
    (t) => !t.adult && (scope === SearchScope.ALL || t.media_type === (scope as string)),
  );
}

/**
 * Keys of the films in the same collections as the most popular matches: "The Dark Knight" has
 * no "batman" in its title and isn't in TMDB's results for it, but shares a collection with
 * "Batman Begins". Best effort: a failure adds nothing.
 */
async function franchiseKeys(matches: SearchTitle[], deps: RefineDeps): Promise<Set<string>> {
  const seeds = matches
    .filter((t) => t.media_type === MediaType.MOVIE)
    .sort((a, b) => popularity(b) - popularity(a))
    .slice(0, SEARCH_FRANCHISE_SEEDS);
  try {
    const details = await Promise.all(
      seeds.map((t) =>
        deps.tmdbGet<{ belongs_to_collection?: { id: number } | null }>(`/movie/${t.id}`, {}),
      ),
    );
    const ids = new Set(details.flatMap((d) => d.belongs_to_collection?.id ?? []));
    const collections = await Promise.all(
      [...ids].map((id) => deps.tmdbGet<{ parts: { id: number }[] }>(`/collection/${id}`, {})),
    );
    return new Set(
      collections.flatMap((c) => c.parts.map((p) => `${MediaType.MOVIE}_${p.id}`)),
    );
  } catch {
    return new Set();
  }
}

/** The title + person reading of the words whose person really worked on such a title */
async function creditedTitles(
  scope: SearchScope,
  terms: string[],
  deps: RefineDeps,
): Promise<{ titleQuery: string; matches: SearchTitle[] } | null> {
  const found = await Promise.all(
    personSplits(terms).map(async (split) => {
      const people = await deps.tmdbGet<{ results: { id: number }[] }>("/search/person", {
        query: split.person,
        page: 1,
      });
      return { ...split, personId: people.results[0]?.id };
    }),
  );
  const candidates = found
    .filter((f) => f.personId !== undefined)
    .slice(0, SEARCH_PERSON_MAX_CHECKS);
  for (const { title, personId } of candidates) {
    const [credits, named] = await Promise.all([
      deps.tmdbGet<PersonCredits>(`/person/${personId}/combined_credits`, {}),
      deps.search(scope, title),
    ]);
    const credited = creditedInScope(credits, scope);
    const inSearch = new Set(named.results.map(titleKey));
    const direct = credited.filter((t) => titleMatches(t, title) || inSearch.has(titleKey(t)));
    if (direct.length === 0) continue;
    const franchise = await franchiseKeys(direct, deps);
    const directKeys = new Set(direct.map(titleKey));
    const matches = credited
      .filter((t) => directKeys.has(titleKey(t)) || franchise.has(titleKey(t)))
      .sort((a, b) => popularity(b) - popularity(a));
    return { titleQuery: title, matches };
  }
  return null;
}

async function titlesFromYear(
  scope: SearchScope,
  query: string,
  year: number,
  deps: RefineDeps,
): Promise<SearchTitle[]> {
  const searches = YEAR_SEARCHES.filter((s) => scope === SearchScope.ALL || s.scope === scope);
  const lists = await Promise.all(
    searches.map(async (s) => {
      const page = await deps.tmdbGet<TmdbSearchPage>(s.path, {
        query,
        [s.yearParam]: year,
        page: 1,
      });
      return mergeSearchPages([page], s.scope);
    }),
  );
  return lists.flat();
}

/**
 * A query TMDB can't match as a title because it also names a year or a person ("batman 2006",
 * "batman christian bale", both at once). The person's titles come first, then the title's
 * ordinary results, each closest to the year first, so a wrong guess never hides the title.
 * One list (no later batches). null = the words aren't such a query.
 */
export async function refineSearch(
  scope: SearchScope,
  query: string,
  deps: RefineDeps,
): Promise<SearchTitlesResponse | null> {
  const terms = query.split(/\s+/).filter(Boolean);
  if (terms.length < 2) return null;
  const { year, rest } = splitYear(terms);
  const credited = await creditedTitles(scope, rest, deps);
  if (year === null && !credited) return null;

  const titleQuery = credited?.titleQuery ?? rest.join(" ");
  const [named, dated] = await Promise.all([
    deps.search(scope, titleQuery),
    year === null ? Promise.resolve([]) : titlesFromYear(scope, titleQuery, year, deps),
  ]);
  const matches = credited?.matches ?? [];
  const seen = new Set(matches.map(titleKey));
  const others = [...dated, ...named.results].filter((t) => {
    if (seen.has(titleKey(t))) return false;
    seen.add(titleKey(t));
    return true;
  });
  const results = [...byYear(matches, year), ...byYear(others, year)];
  return { results, batch: 1, totalBatches: 1, totalResults: results.length };
}
