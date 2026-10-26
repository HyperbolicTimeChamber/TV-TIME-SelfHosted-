/**
 * Small typo-tolerant matcher for the search suggestions page (no dependency). Queries are
 * typed a letter at a time, so every word counts as a prefix: "brakng ba" still finds
 * "Breaking Bad", "moneyheist" finds "Money Heist".
 */

/** Lowercase, accents and punctuation dropped, a leading "the" ignored */
export function normalize(s: string): string {
	return s
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/^the /, "");
}

/** Edit distance with swapped neighbours counting as one edit */
function editDistance(a: string, b: string): number {
	const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
	for (let j = 1; j <= b.length; j++) d[0][j] = j;
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
			}
		}
	}
	return d[a.length][b.length];
}

/** Typos allowed in a typed word: none for 1–3 letters, one from 4, two from 6 */
const allowedTypos = (len: number) => (len >= 6 ? 2 : len >= 4 ? 1 : 0);

/** How well a typed word matches the start of a title word, 0–1 */
function wordScore(typed: string, word: string): number {
	if (word.startsWith(typed)) return 1;
	const allowed = allowedTypos(typed.length);
	if (allowed > 0) {
		// Compare against the word's start, give or take as many letters as typos allowed
		// (dropped or extra letters)
		let best = Infinity;
		for (let len = typed.length - allowed; len <= typed.length + allowed; len++) {
			if (len > 0 && len <= word.length)
				best = Math.min(best, editDistance(typed, word.slice(0, len)));
		}
		if (best <= allowed) return 1 - 0.2 * best;
	}
	if (typed.length >= 3 && word.includes(typed)) return 0.5;
	return 0;
}

/** Every typed word against its best title word, averaged; 0 when any word misses */
function wordsScore(typedWords: string[], titleWords: string[]): number {
	let total = 0;
	for (const typed of typedWords) {
		const best = Math.max(0, ...titleWords.map((w) => wordScore(typed, w)));
		if (best === 0) return 0;
		total += best;
	}
	return total / typedWords.length;
}

/**
 * How well `query` matches `title`, 0 (no match) to just over 1. Also tries both with the
 * spaces taken out, for "moneyheist" / "spider man". A title that starts with the whole query
 * gets a small bonus so it ranks above a match further in.
 */
export function fuzzyScore(query: string, title: string): number {
	const q = normalize(query);
	const t = normalize(title);
	if (!q || !t) return 0;
	const byWords = wordsScore(q.split(" "), t.split(" "));
	const joined = wordScore(q.replace(/ /g, ""), t.replace(/ /g, ""));
	const score = Math.max(byWords, joined);
	return score > 0 && t.startsWith(q) ? score + 0.1 : score;
}

/** Candidates scoring at least `min`, best first (ties keep their given order) */
export function fuzzyRank(query: string, candidates: string[], min = 0.5): string[] {
	return candidates
		.map((c, i) => ({ c, i, s: fuzzyScore(query, c) }))
		.filter((x) => x.s >= min)
		.sort((a, b) => b.s - a.s || a.i - b.i)
		.map((x) => x.c);
}

/** The query cleaned up (punctuation, accents, a leading "the"), when that changes it */
export function cleanedQuery(query: string): string | null {
	const clean = normalize(query);
	return clean && clean !== query.trim().toLowerCase() ? clean : null;
}

/** Words too common to narrow a search on their own */
const FILLER = new Set(["the", "and", "for", "with", "from", "you", "your", "of", "a", "an"]);

/**
 * A multi-word query's words worth searching one by one when the whole query finds nothing:
 * TMDB only matches correctly spelt words, so one typo sinks the lot, but the other words
 * still find the title on their own. Longest first (more specific), 3+ letters, no filler,
 * at most `max`. Empty for a single word — that is the query already tried.
 */
export function fallbackWords(query: string, max = 3): string[] {
	const words = [...new Set(normalize(query).split(" "))];
	if (words.length < 2) return [];
	return words
		.filter((w) => w.length >= 3 && !FILLER.has(w))
		.sort((a, b) => b.length - a.length)
		.slice(0, max);
}

/** A query's suggestions from moments ago */
interface Remembered {
	results: string[];
	at: number;
}
/** Recent queries → their suggestions; short-lived, one per open search page */
export type SuggestionMemory = Map<string, Remembered>;

/** How long a keystroke's suggestions stay reusable */
export const SUGGESTION_MEMORY_MS = 2 * 60 * 1000;
const MEMORY_SIZE = 20;

const memoryKey = (query: string) => query.trim().toLowerCase();

/** Keep a query's suggestions (non-empty only), dropping expired and the oldest beyond 20 */
export function rememberSuggestions(
	memory: SuggestionMemory,
	query: string,
	results: string[],
	now: number,
): void {
	for (const [key, entry] of memory) if (now - entry.at > SUGGESTION_MEMORY_MS) memory.delete(key);
	if (results.length === 0) return;
	memory.delete(memoryKey(query));
	memory.set(memoryKey(query), { results, at: now });
	while (memory.size > MEMORY_SIZE) memory.delete(memory.keys().next().value!);
}

/**
 * When `query` finds nothing: the suggestions of the longest earlier query it starts with
 * (typed a moment ago), kept only where they still fuzzily match `query`, best first.
 * "breaking bda" reuses what "breaking b" found and keeps Breaking Bad — no new request.
 */
export function rememberedMatches(memory: SuggestionMemory, query: string, now: number): string[] {
	const key = memoryKey(query);
	for (let len = key.length - 1; len >= 2; len--) {
		const entry = memory.get(key.slice(0, len).trimEnd());
		if (!entry || now - entry.at > SUGGESTION_MEMORY_MS) continue;
		return fuzzyRank(query, entry.results, Number.MIN_VALUE);
	}
	return [];
}
