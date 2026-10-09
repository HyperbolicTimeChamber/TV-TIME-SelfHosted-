import { useState, useCallback, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "../../stores";
import { searchSuggestions } from "../../services/tmdb";

const HISTORY_KEY = "search_history";
const MAX_BYTES = 10240;

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
			searchSuggestions(apiKey, trimmed)
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

	const filteredHistory =
		query.length > 0
			? searchHistory.filter((h) => h.toLowerCase().includes(query.toLowerCase()))
			: searchHistory;

	// Typed query + TMDB suggestions (deduped against history)
	const suggestionItems =
		query.trim().length > 0
			? [
					query.trim(),
					...tmdbSuggestions.filter(
						(s) =>
							s.toLowerCase() !== query.trim().toLowerCase() &&
							!filteredHistory.some((h) => h.toLowerCase() === s.toLowerCase()),
					),
				]
			: [];

	return {
		query,
		setQuery,
		addToHistory,
		clearHistory,
		filteredHistory,
		suggestionItems,
	};
}
