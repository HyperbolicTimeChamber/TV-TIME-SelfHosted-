import { TITLE_KEYWORD_MAX } from "./enums";
import { TMDBKeyword } from "./types";

/** A title's genres + keywords (catalog doc / tracking doc) */
export interface TitleFacets {
  genres: string[];
  keywords: string[];
}

/** Value → how many of the user's tracked titles carry it. Map keys can't repeat: no duplicates */
export type FacetCounts = Record<string, number>;

/** users/{uid}/facets/{mediaType} */
export interface UserFacets {
  genres: FacetCounts;
  keywords: FacetCounts;
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

/**
 * Genres + keywords copied from a catalog doc onto a tracking doc, so Watch History can filter
 * with array-contains-any in the Firestore query (tracking docs are what it pages through).
 * Deduped: TMDB lists each once, but a doc written by hand / an old build might not.
 */
export function titleFacets(
  catalog: { genres?: string[]; keywords?: string[] } | null | undefined,
): TitleFacets {
  return {
    genres: [...new Set(catalog?.genres ?? [])],
    keywords: [...new Set(catalog?.keywords ?? [])],
  };
}

export const sameFacets = (a: Partial<TitleFacets> | undefined, b: TitleFacets) =>
  sameList(a?.genres, b.genres) && sameList(a?.keywords, b.keywords);

function sameList(a: unknown, b: string[]) {
  return Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Absolute counts over a set of titles (rebuild: import, backfill) */
export function countFacets(titles: Iterable<Partial<TitleFacets>>): UserFacets {
  const out: UserFacets = { genres: {}, keywords: {} };
  for (const t of titles) {
    for (const g of new Set(t.genres ?? [])) out.genres[g] = (out.genres[g] ?? 0) + 1;
    for (const k of new Set(t.keywords ?? [])) out.keywords[k] = (out.keywords[k] ?? 0) + 1;
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
  };
}
