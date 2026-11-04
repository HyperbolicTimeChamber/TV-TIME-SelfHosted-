import { TITLE_COMPANY_MAX, TITLE_KEYWORD_MAX, TITLE_NETWORK_MAX } from "./enums";
import { TMDBKeyword } from "./types";

/** A title's genres + keywords + origin countries + studios (catalog doc / tracking doc) */
export interface TitleFacets {
  genres: string[];
  keywords: string[];
  /** TMDB origin_country: ISO 3166-1 codes ("KR") — the Country filter, regional aliases */
  countries: string[];
  /** TMDB networks (TV) then production companies, by name ("HBO", "Marvel Studios") */
  studios: string[];
}

/** Catalog fields the facets come from (any may be missing on an older doc) */
export type FacetSource = {
  genres?: string[];
  keywords?: string[];
  countries?: string[];
  studios?: string[];
};

/** Value → how many of the user's tracked titles carry it. Map keys can't repeat: no duplicates */
export type FacetCounts = Record<string, number>;

/** users/{uid}/facets/{mediaType} */
export interface UserFacets {
  genres: FacetCounts;
  keywords: FacetCounts;
  countries: FacetCounts;
  studios: FacetCounts;
}

/** What one write did to a user's facets doc — sent back so the client patches its copy */
export interface FacetDelta {
  remove: TitleFacets | null;
  add: TitleFacets | null;
}

/** TMDB keyword list → the names a catalog doc keeps: lowercase, trimmed, unique, capped */
export function keywordNames(list: TMDBKeyword[] | undefined): string[] {
  const names = (list ?? []).map((k) => k.name.trim().toLowerCase()).filter(Boolean);
  return [...new Set(names)].slice(0, TITLE_KEYWORD_MAX);
}

/** TMDB origin_country → the codes a catalog doc keeps: upper-case two-letter codes, unique */
export function countryCodes(list: string[] | undefined): string[] {
  const codes = (list ?? []).map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
  return [...new Set(codes)];
}

/**
 * A title's studios: its TV networks first (what people mean by "an HBO show"), then its lead
 * production companies — each capped on its own (TITLE_NETWORK_MAX / TITLE_COMPANY_MAX), so
 * networks never crowd the companies out. Kept by name, not TMDB id: a network and a company
 * of the same name ("Netflix", "HBO") are one filter choice, and a rename reaches every title
 * the next time its catalog doc refreshes (weekly sync / refreshShow / backfill --refetch).
 */
export function studioNames(
  networks: Array<{ name?: string }> | undefined,
  companies: Array<{ name?: string }> | undefined,
): string[] {
  const clean = (list: Array<{ name?: string }> | undefined) => [
    ...new Set((list ?? []).map((s) => (s.name ?? "").trim()).filter(Boolean)),
  ];
  const nets = clean(networks).slice(0, TITLE_NETWORK_MAX);
  const comps = clean(companies)
    .filter((n) => !nets.includes(n))
    .slice(0, TITLE_COMPANY_MAX);
  return [...nets, ...comps];
}

/**
 * Genres + keywords + countries + studios copied from a catalog doc onto a tracking doc, so Watch
 * History can filter with array-contains-any in the Firestore query (tracking docs are what it
 * pages through).
 * Deduped: TMDB lists each once, but a doc written by hand / an old build might not.
 */
export function titleFacets(catalog: FacetSource | null | undefined): TitleFacets {
  return {
    genres: [...new Set(catalog?.genres ?? [])],
    keywords: [...new Set(catalog?.keywords ?? [])],
    countries: [...new Set(catalog?.countries ?? [])],
    studios: [...new Set(catalog?.studios ?? [])],
  };
}

export const sameFacets = (a: Partial<TitleFacets> | undefined, b: TitleFacets) =>
  sameList(a?.genres, b.genres) &&
  sameList(a?.keywords, b.keywords) &&
  sameList(a?.countries, b.countries) &&
  sameList(a?.studios, b.studios);

function sameList(a: unknown, b: string[]) {
  return Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Absolute counts over a set of titles (rebuild: import, backfill) */
export function countFacets(titles: Iterable<Partial<TitleFacets>>): UserFacets {
  const out: UserFacets = { genres: {}, keywords: {}, countries: {}, studios: {} };
  for (const t of titles) {
    for (const g of new Set(t.genres ?? [])) out.genres[g] = (out.genres[g] ?? 0) + 1;
    for (const k of new Set(t.keywords ?? [])) out.keywords[k] = (out.keywords[k] ?? 0) + 1;
    for (const c of new Set(t.countries ?? [])) out.countries[c] = (out.countries[c] ?? 0) + 1;
    for (const st of new Set(t.studios ?? [])) out.studios[st] = (out.studios[st] ?? 0) + 1;
  }
  return out;
}

/**
 * One title's facets leaving (`remove`) and / or arriving (`add`) — values at 0 are dropped,
 * so the doc only lists what some tracked title still has.
 */
export function applyFacetDelta(
  current: Partial<UserFacets> | undefined,
  remove: Partial<TitleFacets> | null,
  add: Partial<TitleFacets> | null,
): UserFacets {
  const step = (counts: FacetCounts | undefined, out: string[] = [], inn: string[] = []) => {
    const next: FacetCounts = { ...(counts ?? {}) };
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
