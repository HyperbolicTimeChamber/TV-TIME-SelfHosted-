import { SEARCH_REGION_ALIASES } from "../../shared/enums";

const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const squash = (s: string) => words(s).join("");

/**
 * Whether a TMDB keyword really is the query (or contains it as whole words): TMDB's keyword
 * search is fuzzy — "k-drama" returns cdrama, jdrama and plain "drama" — and ORing those in
 * filled the list with unrelated titles. "time travel" keeps "time travel romance"; "k-drama"
 * keeps a "kdrama" keyword but not "drama".
 */
export function keywordMatches(query: string, keyword: string): boolean {
  const q = words(query);
  const k = words(keyword);
  if (q.length === 0) return false;
  if (squash(query) === squash(keyword)) return true;
  for (let i = 0; i + q.length <= k.length; i++) {
    if (q.every((w, j) => k[i + j] === w)) return true;
  }
  return false;
}

/** The regional-genre alias a query names (k-drama, anime, …), if any */
export function regionAlias(query: string) {
  return SEARCH_REGION_ALIASES[squash(query)];
}
