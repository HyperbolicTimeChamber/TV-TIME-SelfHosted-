import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
/** Months kept in memory. Every loaded month is flattened into one array (and indexed by day)
 *  on each change, so a long flick through the calendar must not grow that without end */
const MAX_MEMORY_MONTHS = 15;
/** Saves within this of each other are coalesced — a flick builds several months in a row and
 *  each save stringifies the whole cache */
const SAVE_DEBOUNCE_MS = 800;

const monthIndex = (key: string) => {
	const [y, m] = key.split("-").map(Number);
	return y * 12 + m;
};

/** Drop the months furthest from `around`, keeping the cap (and `around` itself) */
function pruneMonths(months: Map<string, UpcomingEpisode[]>, around: string) {
	if (months.size <= MAX_MEMORY_MONTHS) return months;
	const centre = monthIndex(around);
	const farthest = [...months.keys()]
		.sort((a, b) => Math.abs(monthIndex(b) - centre) - Math.abs(monthIndex(a) - centre))
		.slice(0, months.size - MAX_MEMORY_MONTHS);
	for (const key of farthest) if (key !== around) months.delete(key);
	return months;
}

interface CalendarCache {
	months: Record<string, UpcomingEpisode[]>;
	/** Legacy single stamp (one for every month) — read as the stamp of months without their own */
	syncDate?: string | null;
	/** Month → lastCatalogSync it was built under */
	monthSyncs?: Record<string, string | null>;
}

const monthSync = (cache: CalendarCache, key: string) =>
	cache.monthSyncs?.[key] ?? cache.syncDate ?? null;

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
			if (key === currentKey) continue;
			delete cache.months[key];
			delete cache.monthSyncs?.[key];
		}
	}
	await AsyncStorage.setItem(CacheKey.CALENDAR_MONTHS, JSON.stringify(cache)).catch(() => {});
}

// Coalesced: JSON.stringify of a dozen months is the single most expensive thing a month
// build does, and a flick builds several in a row
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function queueCalendarSave(cache: CalendarCache) {
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		saveTimer = null;
		saveCalendarCache(cache);
	}, SAVE_DEBOUNCE_MS);
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
	// Months whose first build finished (with or without a result) — an uncached month shows
	// the skeleton until then, a cached one never does
	const [settled, setSettled] = useState<ReadonlySet<string>>(new Set());
	const calendarCacheRef = useRef<CalendarCache>({ months: {} });
	// Persisted months read back — builds wait for it, so a save never drops the stored months
	// or their stamps (a stamp-less save read as stale next launch and wiped the cache)
	const restoredRef = useRef<{ uid: string; done: Promise<void> } | null>(null);
	// Months asked for this session — re-checked when the sync stamp / API key arrives
	const requested = useRef(new Set<string>());
	const building = useRef(new Set<string>());
	const apiKey = useAuthStore((s) => s.appTmdbApiKey);
	// From authStore's config/app read — no extra read here
	const lastCatalogSync = useAuthStore((s) => s.lastCatalogSync);
	const queryClient = useQueryClient();

	// AsyncStorage only: cached months render at once, whatever the network does. Staleness
	// (backend synced since a month was built) is checked per month in loadMonthEpisodes
	const restore = useCallback((uid: string) => {
		if (restoredRef.current?.uid === uid) return restoredRef.current.done;
		const done = loadCalendarCache().then((cache) => {
			calendarCacheRef.current = cache;
			const restored = new Map<string, UpcomingEpisode[]>(Object.entries(cache.months));
			if (restored.size > 0) setEpisodesByMonth(restored);
		});
		restoredRef.current = { uid, done };
		return done;
	}, []);

	useEffect(() => {
		if (userId) restore(userId);
	}, [userId, restore]);

	const allEpisodes = useMemo(() => {
		const all: UpcomingEpisode[] = [];
		for (const eps of episodesByMonth.values()) all.push(...eps);
		return all;
	}, [episodesByMonth]);

	const loadMonthEpisodes = useCallback(
		async (year: number, month: number) => {
			if (!userId) return;
			const monthKey = `${year}-${String(month).padStart(2, "0")}`;
			requested.current.add(monthKey);
			await restore(userId);
			const cache = calendarCacheRef.current;
			const cached = monthKey in cache.months;
			// Cached + built under the current sync → done. Sync not known yet → trust the cache
			const syncNow = useAuthStore.getState().lastCatalogSync;
			if (cached && !isCalendarCacheStale(monthSync(cache, monthKey), syncNow)) return;
			// Stale months rebuild in the background (still shown); retried once the key arrives
			if (!apiKey || building.current.has(monthKey)) return;

			building.current.add(monthKey);
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

				// Update state + persist to cache, stamped with the sync it was built under
				setEpisodesByMonth((prev) => {
					const next = new Map(prev);
					next.set(monthKey, episodes);
					return pruneMonths(next, monthKey);
				});
				const target = calendarCacheRef.current;
				target.months[monthKey] = episodes;
				target.monthSyncs = { ...target.monthSyncs, [monthKey]: syncNow };
				queueCalendarSave(target);
			} finally {
				building.current.delete(monthKey);
				setSettled((prev) => (prev.has(monthKey) ? prev : new Set(prev).add(monthKey)));
			}
		},
		[userId, apiKey, queryClient, restore],
	);

	// Sync stamp / API key arrived (or changed): rebuild the asked-for months now stale or unbuilt
	useEffect(() => {
		for (const key of requested.current) {
			const [y, m] = key.split("-").map(Number);
			loadMonthEpisodes(y, m);
		}
	}, [lastCatalogSync, loadMonthEpisodes]);

	/** Shown month has nothing to render yet (skeleton) — false for cached months, even stale */
	const isMonthLoading = useCallback(
		(year: number, month: number) => {
			const key = `${year}-${String(month).padStart(2, "0")}`;
			return !episodesByMonth.has(key) && !settled.has(key);
		},
		[episodesByMonth, settled],
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
			if (changed) queueCalendarSave(calendarCacheRef.current);
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
			queueCalendarSave(calendarCacheRef.current);
			return next;
		});
	}, []);

	const invalidateMonth = useCallback((year: number, month: number) => {
		const monthKey = `${year}-${String(month).padStart(2, "0")}`;
		setEpisodesByMonth((prev) => {
			const next = new Map(prev);
			next.delete(monthKey);
			delete calendarCacheRef.current.months[monthKey];
			queueCalendarSave(calendarCacheRef.current);
			return next;
		});
		setSettled((prev) => {
			if (!prev.has(monthKey)) return prev;
			const next = new Set(prev);
			next.delete(monthKey);
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
		isMonthLoading,
		loadMonthEpisodes,
		removeShowFromCalendar,
		addMovieToCalendar,
		invalidateMonth,
	};
}
