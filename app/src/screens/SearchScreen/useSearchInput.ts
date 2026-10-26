import { useState, useCallback, useEffect, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "../../stores";
import { searchSuggestions } from "../../services/tmdb";
import { getCachedCatalogTitles } from "../../hooks/useWatchlist";
import { cleanedQuery, fallbackWords, fuzzyRank, fuzzyScore } from "../../utils/fuzzy";

const HISTORY_KEY = "search_history";
const MAX_BYTES = 10240;
/** Most fuzzy matches from your own shows listed above TMDB's */
const MAX_LOCAL = 3;

/**
 * TMDB suggestions. When the query finds nothing: the cleaned-up query, then each meaningful
 * word on its own, in parallel ("brakng bad" → "bad" finds Breaking Bad), merged. A single word
 * casts a wide net ("monye" finds people named Monye), so only results that still fuzzily match
 * the whole typed query are kept — nothing beats noise.
 */
async function suggestionsWithFallback(apiKey: string, query: string): Promise<string[]> {
	const first = await searchSuggestions(apiKey, query);
	if (first.length > 0) return first;
	const matching = (found: string[]) => found.filter((s) => fuzzyScore(query, s) > 0);

	const clean = cleanedQuery(query);
	if (clean && clean.length >= 2) {
		const found = matching(await searchSuggestions(apiKey, clean));
		if (found.length > 0) return found;
	}

	const perWord = await Promise.all(
		fallbackWords(query).map((w) => searchSuggestions(apiKey, w).catch(() => [] as string[])),
	);
	const merged: string[] = [];
	const seen = new Set<string>();
	for (const s of perWord.flat()) {
		const key = s.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push(s);
	}
	return matching(merged);
}

/**
 * Search box state: query, local search history (≤10KB) and debounced TMDB
 * suggestions. Shared by the mobile SearchInputScreen and the web search input.
 */
export function useSearchInput(initialQuery = "") {
	const [query, setQuery] = useState(initialQuery);
	const [searchHistory, setSearchHistory] = useState<string[]>([]);
	const [tmdbSuggestions, setTmdbSuggestions] = useState<string[]>([]);
	const apiKey = useAuthStore((s) => s.appTmdbApiKey);

	useEffect(() => {
		AsyncStorage.getItem(HISTORY_KEY)
			.then((raw) => {
				if (raw) setSearchHistory(JSON.parse(raw));
			})
			.catch(() => {});
	}, []);

	// Debounced TMDB suggestions
	useEffect(() => {
		const trimmed = query.trim();
		if (trimmed.length < 2 || !apiKey) {
			setTmdbSuggestions([]);
			return;
		}
		const timer = setTimeout(() => {
			suggestionsWithFallback(apiKey, trimmed)
				.then(setTmdbSuggestions)
				.catch(() => setTmdbSuggestions([]));
		}, 200);
		return () => clearTimeout(timer);
	}, [query, apiKey]);

	const addToHistory = useCallback((term: string) => {
		const trimmed = term.trim().toLowerCase();
		if (!trimmed || trimmed.length < 2) return;
		setSearchHistory((prev) => {
			const filtered = prev.filter((h) => h.toLowerCase() !== trimmed);
			const next = [trimmed, ...filtered];
			while (JSON.stringify(next).length > MAX_BYTES && next.length > 1) {
				next.pop();
			}
			AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
			return next;
		});
	}, []);

	const clearHistory = useCallback(() => {
		setSearchHistory([]);
		AsyncStorage.removeItem(HISTORY_KEY).catch(() => {});
	}, []);

	const trimmed = query.trim();
	// Typo-tolerant, best match first
	const filteredHistory = useMemo(
		() => (trimmed.length > 0 ? fuzzyRank(trimmed, searchHistory) : searchHistory),
		[trimmed, searchHistory],
	);

	// Typed query, then close matches among your own shows (instant, offline), then TMDB's
	// suggestions re-ranked by how close they are to what's typed — TMDB's own (popularity)
	// order breaks ties. Deduped against each other and the history list
	const suggestionItems = useMemo(() => {
		if (trimmed.length === 0) return [];
		const local = trimmed.length >= 2 ? fuzzyRank(trimmed, getCachedCatalogTitles()) : [];
		const ranked = tmdbSuggestions
			.map((s, i) => ({ s, i, score: fuzzyScore(trimmed, s) }))
			.sort((a, b) => b.score - a.score || a.i - b.i)
			.map((x) => x.s);
		const seen = new Set([trimmed.toLowerCase(), ...filteredHistory.map((h) => h.toLowerCase())]);
		const out = [trimmed];
		for (const s of [...local.slice(0, MAX_LOCAL), ...ranked]) {
			const key = s.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(s);
		}
		return out;
	}, [trimmed, tmdbSuggestions, filteredHistory]);

	return {
		query,
		setQuery,
		addToHistory,
		clearHistory,
		filteredHistory,
		suggestionItems,
	};
}
