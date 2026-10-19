import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFirestore, doc, getDoc } from "@react-native-firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { discoverMoviesByReleaseDate } from "../services";
import { useAuthStore } from "../stores";
import { UpcomingEpisode, MediaType, CacheKey } from "../types";
import { cacheCatalogShows, getCachedCatalogShow, whenCatalogRestored } from "./useWatchlist";
import { fetchCatalogShows } from "../services/historyApi";
import { showDocId } from "../utils/docId";
import { trackedIdsQuery } from "./useTrackedIds";
import { useQueryClient } from "@tanstack/react-query";
import { isCalendarCacheStale } from "../utils/calendarCache";

const MAX_CACHED_MONTHS = 12;

interface CalendarCache {
	months: Record<string, UpcomingEpisode[]>;
	syncDate?: string | null;
}

async function loadCalendarCache(): Promise<CalendarCache> {
	try {
		const raw = await AsyncStorage.getItem(CacheKey.CALENDAR_MONTHS);
		if (!raw) return { months: {} };
		return JSON.parse(raw) as CalendarCache;
	} catch {
		return { months: {} };
	}
}

async function saveCalendarCache(cache: CalendarCache) {
	// Prune to MAX_CACHED_MONTHS most recent, never evict current month
	const now = new Date();
	const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
	const keys = Object.keys(cache.months)
		.sort((a, b) => a.localeCompare(b))
		.reverse();
	if (keys.length > MAX_CACHED_MONTHS) {
		for (const key of keys.slice(MAX_CACHED_MONTHS)) {
			if (key !== currentKey) delete cache.months[key];
		}
	}
	await AsyncStorage.setItem(CacheKey.CALENDAR_MONTHS, JSON.stringify(cache)).catch(() => {});
}

/** Shows with an episode in the persisted Upcoming lists (server upcoming + already-aired
 *  queue) — the airing ones, whose catalogs the calendar can't do without */
async function upcomingShowIds(): Promise<number[]> {
	const ids = new Set<number>();
	const raws = await Promise.all(
		[CacheKey.UPCOMING_EPISODES, CacheKey.UPCOMING_PAST].map((k) =>
			AsyncStorage.getItem(k).catch(() => null),
		),
	);
	for (const raw of raws) {
		try {
			for (const ep of (JSON.parse(raw ?? "{}").episodes ?? []) as UpcomingEpisode[]) {
				if (ep.mediaType !== MediaType.MOVIE) ids.add(ep.tmdbShowId);
			}
		} catch {}
	}
	return [...ids];
}

// Global mutation listeners (cross-screen)
type CalendarRemoveCallback = (tmdbId: number) => void;
type CalendarAddMovieCallback = (movie: UpcomingEpisode) => void;
const removeListeners = new Set<CalendarRemoveCallback>();
const addMovieListeners = new Set<CalendarAddMovieCallback>();

export function removeShowFromCalendarGlobal(tmdbId: number) {
	removeListeners.forEach((fn) => fn(tmdbId));
}

export function addMovieToCalendarGlobal(movie: UpcomingEpisode) {
	addMovieListeners.forEach((fn) => fn(movie));
}

export function useCalendarEpisodes(userId: string | undefined) {
	const [episodesByMonth, setEpisodesByMonth] = useState<Map<string, UpcomingEpisode[]>>(new Map());
	const [loading, setLoading] = useState(true);
	const calendarCacheRef = useRef<CalendarCache>({ months: {} });
	const cacheLoaded = useRef(false);
	const apiKey = useAuthStore((s) => s.appTmdbApiKey);
	const queryClient = useQueryClient();

	// Load persisted cache + config sync date (for cache invalidation)
	useEffect(() => {
		if (!userId) return;

		// Load calendar cache + config sync date in parallel
		// Config read is 1 doc — needed for cache invalidation
		const db = getFirestore();
		Promise.all([loadCalendarCache(), getDoc(doc(db, "config", "app")).catch(() => null)]).then(
			([cache, configSnap]) => {
				// Check sync date — invalidate cache if backend synced since
				const serverSync = configSnap?.data?.()?.lastCatalogSync;
				const serverSyncStr = serverSync?.toDate?.()?.toISOString?.() || null;

				if (isCalendarCacheStale(cache.syncDate, serverSyncStr)) {
					cache.months = {};
					cache.syncDate = serverSyncStr;
					saveCalendarCache(cache);
				}

				// Keep any month fetched while this was loading (it's built from current catalogs)
				cache.months = { ...cache.months, ...calendarCacheRef.current.months };
				calendarCacheRef.current = cache;

				const restored = new Map<string, UpcomingEpisode[]>();
				for (const [key, eps] of Object.entries(cache.months)) {
					restored.set(key, eps);
				}
				if (restored.size > 0) {
					setEpisodesByMonth(restored);
					setLoading(false);
				}
				cacheLoaded.current = true;
			},
		);
	}, [userId]);

	const allEpisodes = useMemo(() => {
		const all: UpcomingEpisode[] = [];
		for (const eps of episodesByMonth.values()) all.push(...eps);
		return all;
	}, [episodesByMonth]);

	const loadMonthEpisodes = useCallback(
		async (year: number, month: number) => {
			if (!userId || !apiKey) return;
			const monthKey = `${year}-${String(month).padStart(2, "0")}`;
			if (episodesByMonth.has(monthKey)) {
				setLoading(false);
				return;
			}

			setLoading(true);
			try {
				// Wait for the real tracked set — an empty one would save an empty month to
				// AsyncStorage until the next catalog sync
				const [tracked] = await Promise.all([
					queryClient.ensureQueryData(trackedIdsQuery(userId)),
					whenCatalogRestored(),
				]);

				const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
				const lastDay = new Date(year, month, 0).getDate();
				const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
				const inMonth = (date: string | null | undefined): date is string =>
					!!date && date >= startDate && date <= endDate;

				// Airing shows whose catalog isn't in memory yet (the watchlist only loads catalogs for
				// the pages it has shown): fetch those once — persisted, so later months cost nothing.
				// Without this the calendar silently skipped them while Upcoming listed them
				const missing = (await upcomingShowIds()).filter(
					(id) => tracked.has(id) && !getCachedCatalogShow(id, MediaType.TV),
				);
				if (missing.length > 0) {
					cacheCatalogShows(
						await fetchCatalogShows(missing.map((id) => showDocId(id, MediaType.TV))).catch(
							() => [],
						),
					);
				}

				// Split TV vs movie using the shared catalog cache (no Firestore reads)
				const tvCatalogs = [...tracked]
					.map((id) => getCachedCatalogShow(id, MediaType.TV))
					.filter((c) => c !== null);
				const movieCatalogs = [...tracked]
					.map((id) => getCachedCatalogShow(id, MediaType.MOVIE))
					.filter((c) => c !== null);
				const movieIds = new Set(movieCatalogs.map((c) => c.tmdbId));

				const movieResults = movieIds.size
					? await discoverMoviesByReleaseDate(apiKey, startDate, endDate)
					: [];

				// TV: every tracked show's catalog episodes in this month (not TMDB discover —
				// it caps at the 100 most popular shows)
				const episodes: UpcomingEpisode[] = [];
				for (const catalog of tvCatalogs) {
					for (const season of catalog.seasons || []) {
						if (season.seasonNumber === 0) continue;
						for (const ep of season.episodes || []) {
							if (!inMonth(ep.airDate)) continue;
							episodes.push({
								tmdbShowId: catalog.tmdbId ?? 0,
								showTitle: catalog.title ?? "",
								posterPath: catalog.posterPath ?? null,
								season: season.seasonNumber,
								episode: ep.episodeNumber,
								episodeTitle: ep.title,
								airDate: ep.airDate,
								runtime: ep.runtime ?? null,
								// Exact time (TVMaze) — orders the day's cards
								...(ep.airStamp ? { airStamp: ep.airStamp } : {}),
							});
						}
					}
				}

				// Movies: tracked releases from discover, plus catalog release dates it missed
				const seen = new Set<string>();
				for (const movie of movieResults) {
					if (!movieIds.has(movie.id)) continue;
					const movieKey = `movie_${movie.id}`;
					if (seen.has(movieKey)) continue;
					episodes.push({
						tmdbShowId: movie.id,
						showTitle: movie.title,
						posterPath: movie.poster_path,
						season: 0,
						episode: 0,
						episodeTitle: movie.title,
						airDate: movie.release_date,
						runtime: null,
						mediaType: MediaType.MOVIE,
					});
					seen.add(movieKey);
				}
				for (const catalog of movieCatalogs) {
					if (!inMonth(catalog.releaseDate) || seen.has(`movie_${catalog.tmdbId}`)) continue;
					episodes.push({
						tmdbShowId: catalog.tmdbId,
						showTitle: catalog.title,
						posterPath: catalog.posterPath,
						season: 0,
						episode: 0,
						episodeTitle: catalog.title,
						airDate: catalog.releaseDate,
						runtime: null,
						mediaType: MediaType.MOVIE,
					});
				}
				episodes.sort((a, b) => a.airDate.localeCompare(b.airDate));

				// Tracked shows but no catalogs in memory yet → show nothing for now, but don't
				// save the month, so the next visit loads it again
				if (tracked.size > 0 && tvCatalogs.length + movieCatalogs.length === 0) return;

				// Update state + persist to cache
				setEpisodesByMonth((prev) => {
					const next = new Map(prev);
					next.set(monthKey, episodes);
					return next;
				});
				calendarCacheRef.current.months[monthKey] = episodes;
				saveCalendarCache(calendarCacheRef.current);
			} finally {
				setLoading(false);
			}
		},
		[userId, apiKey, episodesByMonth, queryClient],
	);

	const removeShowFromCalendar = useCallback((tmdbId: number) => {
		setEpisodesByMonth((prev) => {
			const next = new Map(prev);
			let changed = false;
			for (const [key, eps] of next) {
				const filtered = eps.filter((e) => e.tmdbShowId !== tmdbId);
				if (filtered.length !== eps.length) {
					next.set(key, filtered);
					calendarCacheRef.current.months[key] = filtered;
					changed = true;
				}
			}
			if (changed) saveCalendarCache(calendarCacheRef.current);
			return changed ? next : prev;
		});
	}, []);

	const addMovieToCalendar = useCallback((movie: UpcomingEpisode) => {
		const monthKey = movie.airDate.slice(0, 7); // "2026-07"
		setEpisodesByMonth((prev) => {
			const next = new Map(prev);
			const existing = next.get(monthKey);
			if (!existing) return prev; // month not cached, will be fetched when viewed
			if (existing.some((e) => e.tmdbShowId === movie.tmdbShowId)) return prev;
			const updated = [...existing, movie].sort((a, b) => a.airDate.localeCompare(b.airDate));
			next.set(monthKey, updated);
			calendarCacheRef.current.months[monthKey] = updated;
			saveCalendarCache(calendarCacheRef.current);
			return next;
		});
	}, []);

	const invalidateMonth = useCallback((year: number, month: number) => {
		const monthKey = `${year}-${String(month).padStart(2, "0")}`;
		setEpisodesByMonth((prev) => {
			const next = new Map(prev);
			next.delete(monthKey);
			delete calendarCacheRef.current.months[monthKey];
			saveCalendarCache(calendarCacheRef.current);
			return next;
		});
	}, []);

	// Listen for cross-screen mutations
	useEffect(() => {
		removeListeners.add(removeShowFromCalendar);
		addMovieListeners.add(addMovieToCalendar);
		return () => {
			removeListeners.delete(removeShowFromCalendar);
			addMovieListeners.delete(addMovieToCalendar);
		};
	}, [removeShowFromCalendar, addMovieToCalendar]);

	return {
		episodes: allEpisodes,
		loading,
		loadMonthEpisodes,
		removeShowFromCalendar,
		addMovieToCalendar,
		invalidateMonth,
	};
}
