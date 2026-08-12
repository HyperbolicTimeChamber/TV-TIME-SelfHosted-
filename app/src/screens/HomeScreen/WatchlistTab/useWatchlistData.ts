import { useMemo, useEffect, useCallback, useState, useRef } from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Timestamp } from "@react-native-firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	useWatchlist,
	EnrichedTrackingItem,
	getCachedCatalogShow,
	useWatchedEpisodes,
	useWatchedMovies,
	insertWatchedEpisodeCache,
	insertWatchedMovieCache,
	isShowVisible,
	sortByPriority,
	useUpcomingMutations,
	incrementDailyWatch,
	removeWatchedEpisodeCache,
	decrementDailyWatch,
} from "../../../hooks";
import {
	markEpisodeWatched,
	markMovieWatched,
	markSeasonWatchedCF,
	unmarkEpisodeWatched,
	stopWatching,
} from "../../../services";
import { removeShowFromCalendarGlobal } from "../../../hooks/useCalendarEpisodes";
import { emitShowCompleted } from "../../../utils/watchlistEvents";
import {
	MediaType,
	CacheKey,
	QueryKey,
	WatchStatus,
	WatchedEpisode,
	WatchedMovie,
} from "../../../types";
import { ListItem } from "./types";

const ACTIVE_CACHE_LIMIT = 100;

function todayStr() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** Compute remaining aired episodes after nextEp */
function computeRemaining(item: EnrichedTrackingItem, today: string): number | null {
	const nextEp = item.nextEpisode;
	const catalog = item.catalogShow;
	if (!nextEp || !catalog?.seasons) return null;
	let count = 0;
	for (const s of catalog.seasons) {
		if (s.seasonNumber < nextEp.season) continue;
		for (const e of s.episodes) {
			if (s.seasonNumber === nextEp.season && e.episodeNumber <= nextEp.episode) continue;
			if (e.airDate && e.airDate <= today) count++;
		}
	}
	return count > 0 ? count : null;
}

/** Find the episode after a given one in catalog */
function findNextEpisodeInCatalog(
	catalog: any,
	season: number,
	episode: number,
): {
	season: number;
	episode: number;
	title: string | null;
	airDate: string | null;
	runtime: number;
} | null {
	const catalogSeason = catalog?.seasons?.find((s: any) => s.seasonNumber === season);
	const nextInSeason = catalogSeason?.episodes?.find((e: any) => e.episodeNumber === episode + 1);
	if (nextInSeason) {
		return {
			season,
			episode: nextInSeason.episodeNumber,
			title: nextInSeason.title || null,
			airDate: nextInSeason.airDate || null,
			runtime: nextInSeason.runtime || 0,
		};
	}
	const nextCatalogSeason = catalog?.seasons?.find((s: any) => s.seasonNumber === season + 1);
	if (nextCatalogSeason?.episodes?.length > 0) {
		const ep = nextCatalogSeason.episodes[0];
		return {
			season: season + 1,
			episode: ep.episodeNumber ?? 1,
			title: ep.title || null,
			airDate: ep.airDate || null,
			runtime: ep.runtime || 0,
		};
	}
	return null;
}

/** Build a flat card item with all computed fields baked in */
function buildCardItem(item: EnrichedTrackingItem, today: string) {
	const nextEp = item.nextEpisode;
	const catalog = item.catalogShow;
	const catalogSeason = nextEp
		? catalog?.seasons?.find((s: any) => s.seasonNumber === nextEp.season)
		: undefined;
	const catalogEp = catalogSeason?.episodes?.find((e: any) => e.episodeNumber === nextEp?.episode);

	// Compute nextNext episode (what comes after the current next)
	const nextNext =
		nextEp && catalog ? findNextEpisodeInCatalog(catalog, nextEp.season, nextEp.episode) : null;

	return {
		...item,
		nextEpisodeName: item.nextEpisodeName || catalogEp?.title || null,
		nextEpisodeAirDate: item.nextEpisodeAirDate ?? catalogEp?.airDate ?? null,
		nextEpisodeRuntime: catalogEp?.runtime || 0,
		releaseDate: item.releaseDate ?? catalog?.releaseDate ?? null,
		director: catalog?.credits?.directors?.[0] ?? null,
		remaining: computeRemaining(item, today),
		// Pre-computed next-next for optimistic mark watched
		nextNextEpisode: nextNext ? { season: nextNext.season, episode: nextNext.episode } : null,
		nextNextEpisodeName: nextNext?.title ?? null,
		nextNextEpisodeAirDate: nextNext?.airDate ?? null,
		nextNextEpisodeRuntime: nextNext?.runtime ?? 0,
		// Only mark as last episode if catalog is available to confirm — prevents premature COMPLETED
		isLastEpisode: nextEp != null && catalog != null && !nextNext,
		isSeasonFinale:
			catalogEp?.isSeasonFinale ??
			(catalogEp && catalogSeason ? catalogEp.episodeNumber === catalogSeason.episodeCount : false),
	};
}

export type CardItem = ReturnType<typeof buildCardItem>;

/**
 * Daily reorder: re-evaluate cached cards for newly-airable episodes.
 * Cards whose nextEpisodeAirDate is now <= today get promoted to top.
 * Recalc `remaining` only for promoted cards.
 * Works for any gap duration (1 day or 3 weeks).
 */
function reorderCachedList(list: CacheableListItem[], today: string): CacheableListItem[] {
	// Separate sections
	const prevWatchedHeader = list.find(
		(i) => i.type === "sectionHeader" && i.title === "Previously Watched",
	);
	const upNextHeader = list.find((i) => i.type === "sectionHeader" && i.title === "What's Up Next");
	const prevWatched = list.filter((i) => i.type === "watchedEpisode" || i.type === "watchedMovie");
	const showCards = list.filter((i) => i.type === "show") as Array<{
		type: "show";
		card: any;
	}>;

	// Partition into promoted (newly airable) vs rest
	const promoted: typeof showCards = [];
	const rest: typeof showCards = [];

	for (const item of showCards) {
		const card = item.card;
		const airDate = card.nextEpisodeAirDate;
		// Card is promotable if it has an airDate that's now past/today
		// and wasn't already visible (was future when cached)
		// Simple heuristic: if airDate <= today, ensure it's at the top
		if (airDate && airDate <= today && card.nextEpisode) {
			// Recalc remaining for promoted cards (approximate — full recalc on live data)
			// We don't have catalog in cache, so just null out remaining (will be filled by listener)
			promoted.push({
				...item,
				card: { ...card, remaining: null },
			});
		} else {
			rest.push(item);
		}
	}

	// Sort promoted by airDate desc (most recent first)
	promoted.sort((a, b) => {
		const dateA = a.card.nextEpisodeAirDate || "";
		const dateB = b.card.nextEpisodeAirDate || "";
		return dateB.localeCompare(dateA);
	});

	// Rebuild list
	const result: CacheableListItem[] = [];
	if (prevWatchedHeader && prevWatched.length > 0) {
		result.push(prevWatchedHeader);
		result.push(...prevWatched);
	}
	const allShows = [...promoted, ...rest];
	if (allShows.length > 0) {
		result.push(upNextHeader ?? { type: "sectionHeader", title: "What's Up Next" });
		result.push(...allShows);
	}
	return result;
}

/** Serializable list item for caching */
export type CacheableListItem =
	| { type: "sectionHeader"; title: string }
	| { type: "show"; card: CardItem }
	| {
			type: "watchedEpisode";
			episode: WatchedEpisode;
			showTitle: string;
			posterPath: string | null;
			tmdbId: number;
	  }
	| {
			type: "watchedMovie";
			movie: WatchedMovie;
			showTitle: string;
			posterPath: string | null;
			tmdbId: number;
	  };

export function useWatchlistData(userId: string | undefined) {
	const {
		items,
		loading,
		loadMore: loadMoreTracking,
		loadingMore: loadingMoreTracking,
		hasMore: hasMoreTracking,
		removeItem,
	} = useWatchlist(userId);

	const {
		episodes: watchedEps,
		loading: watchedEpsLoading,
		loadMore: loadMoreEps,
		loadingMore: loadingMoreEps,
		hasMore: hasMoreEps,
	} = useWatchedEpisodes(userId);
	const {
		movies: watchedMovies,
		loading: watchedMoviesLoading,
		loadMore: loadMoreMovies,
		loadingMore: loadingMoreMovies,
		hasMore: hasMoreMovies,
	} = useWatchedMovies(userId);

	const queryClient = useQueryClient();
	const { mutateCachedUpcoming, rollbackUpcoming, removeShowFromUpcoming } = useUpcomingMutations();
	const [updatingShows, setUpdatingShows] = useState<Map<number, string>>(new Map());
	// Optimistic card patches applied after Firestore write, before listener re-enriches
	const [optimisticCards, setOptimisticCards] = useState<Map<number, Partial<CardItem>>>(new Map());

	// --- Cache: store and restore the display list directly ---
	const [cachedList, setCachedList] = useState<CacheableListItem[] | null>(null);
	const [reordering, setReordering] = useState(false);
	const cacheRestored = useRef(false);
	const cachedActiveCount = useRef(0);

	useEffect(() => {
		if (!userId || cacheRestored.current) return;
		AsyncStorage.getItem(CacheKey.WATCHLIST_ACTIVE).then((raw) => {
			if (!raw) {
				cacheRestored.current = true;
				return;
			}
			try {
				const cached = JSON.parse(raw);
				if (cached.userId !== userId || !cached.list?.length) {
					cacheRestored.current = true;
					return;
				}

				const today = todayStr();
				if (cached.date === today) {
					// Same day — use cache as-is
					setCachedList(cached.list);
					cachedActiveCount.current = cached.list.filter((i: any) => i.type === "show").length;
				} else {
					// Different day — reorder: promote newly-airable shows to top
					setReordering(true);
					const reordered = reorderCachedList(cached.list, today);
					setCachedList(reordered);
					cachedActiveCount.current = reordered.filter((i: any) => i.type === "show").length;
					// Persist with today's date
					AsyncStorage.setItem(
						CacheKey.WATCHLIST_ACTIVE,
						JSON.stringify({ userId, date: today, list: reordered }),
					).catch(() => {});
					setReordering(false);
				}
			} catch {}
			cacheRestored.current = true;
		});
	}, [userId]);

	// --- Computed data from Firestore ---
	const showMap = useMemo(() => {
		const map = new Map<number, EnrichedTrackingItem>();
		for (const item of items) map.set(item.tmdbId, item);
		return map;
	}, [items]);

	const watchedCountByShow = useMemo(() => {
		const map = new Map<number, number>();
		for (const ep of watchedEps) {
			map.set(ep.tmdbShowId, (map.get(ep.tmdbShowId) || 0) + 1);
		}
		return map;
	}, [watchedEps]);

	const sortedActive = useMemo(() => {
		const visible = items.filter((item) => isShowVisible(item));
		return sortByPriority(visible);
	}, [items]);

	// --- Build the display list with all fields baked in ---
	const today = todayStr();

	const PREV_WATCHED_CACHE_SIZE = 10;

	// All watched items sorted descending (most recent first)
	type PrevItem =
		| { kind: MediaType.TV; ep: WatchedEpisode; time: number }
		| { kind: MediaType.MOVIE; movie: WatchedMovie; time: number };

	// Merge-sort display: only show items whose chronological position is
	// confirmed. An item is safe to show if the OTHER type has a fetched item
	// older than it (proving nothing is missing in the gap), or if that type's
	// pages are exhausted.
	const safePrevItems = useMemo(() => {
		const epItems: PrevItem[] = [];
		for (const ep of watchedEps) {
			epItems.push({
				kind: MediaType.TV,
				ep,
				time: ep.lastWatchedAt?.toMillis?.() || 0,
			});
		}
		const movieItems: PrevItem[] = [];
		for (const movie of watchedMovies) {
			movieItems.push({
				kind: MediaType.MOVIE,
				movie,
				time: movie.lastWatchedAt?.toMillis?.() || 0,
			});
		}

		// If one type is empty and fully loaded, show all of the other
		if (epItems.length === 0 && !hasMoreEps) return movieItems;
		if (movieItems.length === 0 && !hasMoreMovies) return epItems;
		// If one type is empty but has more pages, can't show anything from the other
		// (gaps might exist) — show nothing until pull loads data
		if (epItems.length === 0 || movieItems.length === 0) return [];

		// Both have items — compute safe cutoff.
		// An ep is safe if any movie has time <= ep.time (a movie exists at or after it),
		// OR episodes are on last page (!hasMoreEps).
		// A movie is safe if any episode has time <= movie.time, OR !hasMoreMovies.
		const oldestEpTime = epItems[epItems.length - 1].time;
		const oldestMovieTime = movieItems[movieItems.length - 1].time;

		// Safe cutoff: items newer than max(oldestEp, oldestMovie) are guaranteed
		// correct. Beyond that, the lagging type might have unfetched items.
		// Exception: if the lagging type has no more pages, no cutoff needed.
		let cutoff = -Infinity;
		if (hasMoreEps && hasMoreMovies) {
			cutoff = Math.max(oldestEpTime, oldestMovieTime);
		} else if (hasMoreEps) {
			// All movies loaded — eps are the constraint
			cutoff = oldestEpTime;
		} else if (hasMoreMovies) {
			// All eps loaded — movies are the constraint
			cutoff = oldestMovieTime;
		}
		// else: both fully loaded, no cutoff

		return [...epItems, ...movieItems]
			.filter((item) => item.time >= cutoff)
			.sort((a, b) => a.time - b.time); // ascending: oldest first, newest last
	}, [watchedEps, watchedMovies, showMap, hasMoreEps, hasMoreMovies]);

	// Cached tier: 10 most recent (persisted). Volatile tier: older pulled items (clears on restart).
	// safePrevItems is ascending → last N = newest (cached), everything before = volatile (older)
	// Volatile is capped so marking eps outside watchlist tab doesn't grow the list unbounded.
	// Cap grows by 20 each pull-to-refresh.
	const VOLATILE_PAGE = 10;
	const [volatileCap, setVolatileCap] = useState(VOLATILE_PAGE);
	const MAX_VOLATILE = volatileCap;
	const cachedPrevWatched = useMemo(
		() => safePrevItems.slice(-PREV_WATCHED_CACHE_SIZE),
		[safePrevItems],
	);
	const volatilePrevWatched = useMemo(() => {
		if (safePrevItems.length <= PREV_WATCHED_CACHE_SIZE) return [];
		const all = safePrevItems.slice(0, safePrevItems.length - PREV_WATCHED_CACHE_SIZE);
		// Keep only the most recent MAX_VOLATILE volatile items (tail = newest)
		return all.length > MAX_VOLATILE ? all.slice(-MAX_VOLATILE) : all;
	}, [safePrevItems]);

	// Already ascending — volatile (older) then cached (newer), newest at bottom
	const prevWatchedItems = useMemo(
		() => [...volatilePrevWatched, ...cachedPrevWatched],
		[volatilePrevWatched, cachedPrevWatched],
	);

	const allLoading = loading || watchedEpsLoading || watchedMoviesLoading;

	const liveList: CacheableListItem[] = useMemo(() => {
		if (allLoading) return [];
		const result: CacheableListItem[] = [];
		if (prevWatchedItems.length > 0) {
			result.push({ type: "sectionHeader", title: "Previously Watched" });
			for (const item of prevWatchedItems) {
				if (item.kind === MediaType.MOVIE) {
					const show = showMap.get(item.movie.tmdbId);
					const cat = show ? null : getCachedCatalogShow(item.movie.tmdbId, MediaType.MOVIE);
					result.push({
						type: "watchedMovie",
						movie: item.movie,
						showTitle: show?.title ?? cat?.title ?? (item.movie as any).title ?? "",
						posterPath: show?.posterPath ?? cat?.posterPath ?? (item.movie as any).posterPath ?? null,
						tmdbId: item.movie.tmdbId,
					});
				} else {
					const show = showMap.get(item.ep.tmdbShowId);
					const cat = show ? null : getCachedCatalogShow(item.ep.tmdbShowId, MediaType.TV);
					result.push({
						type: "watchedEpisode",
						episode: item.ep,
						showTitle: show?.title ?? cat?.title ?? "",
						posterPath: show?.posterPath ?? cat?.posterPath ?? null,
						tmdbId: item.ep.tmdbShowId,
					});
				}
			}
		}
		if (sortedActive.length > 0) {
			result.push({ type: "sectionHeader", title: "What's Up Next" });
			for (const item of sortedActive.slice(0, ACTIVE_CACHE_LIMIT)) {
				result.push({ type: "show", card: buildCardItem(item, today) });
			}
		}
		return result;
	}, [allLoading, prevWatchedItems, sortedActive, showMap, today]);

	// --- Persist list cache when live data updates (only cached tier, not volatile) ---
	useEffect(() => {
		if (!userId || allLoading || liveList.length === 0) return;

		// Build cache list: 5 most recent watched + up to 100 show cards
		const cacheList: CacheableListItem[] = [];
		// Add only cached prev watched items (5 most recent)
		const cachedWatchedItems = liveList.filter(
			(i) => i.type === "watchedEpisode" || i.type === "watchedMovie",
		);
		const cachedOnly = cachedWatchedItems.slice(-PREV_WATCHED_CACHE_SIZE);
		if (cachedOnly.length > 0) {
			cacheList.push({ type: "sectionHeader", title: "Previously Watched" });
			cacheList.push(...cachedOnly);
		}
		// Add show cards (strip catalogShow)
		const showItems = liveList.filter((i) => i.type === "show");
		if (showItems.length > 0) {
			cacheList.push({ type: "sectionHeader", title: "What's Up Next" });
			for (const item of showItems) {
				if (item.type === "show") {
					const { catalogShow: _catalogShow, ...rest } = item.card;
					cacheList.push({ type: "show" as const, card: rest as CardItem });
				}
			}
		}

		AsyncStorage.setItem(
			CacheKey.WATCHLIST_ACTIVE,
			JSON.stringify({ userId, date: todayStr(), list: cacheList }),
		).catch(() => {});
		if (cachedList) setCachedList(null);
	}, [userId, allLoading, liveList]);

	// --- Effective display: blend cached shows + live previously watched ---
	const rawDisplayList = useMemo(() => {
		if (!cachedList) return liveList;
		if (liveList.length === 0) return cachedList;

		// Live ready — merge: use live Previously Watched + prefer live show cards
		// but keep cached shows as fallback if live has fewer (pagination not loaded yet)
		return liveList;
	}, [cachedList, liveList]);
	const effectiveLoading = reordering || (allLoading && !cachedList);

	// Apply optimistic card patches
	const displayList = useMemo(() => {
		if (optimisticCards.size === 0) return rawDisplayList;
		return rawDisplayList.map((item) => {
			if (item.type !== "show") return item;
			const patch = optimisticCards.get(item.card.tmdbId);
			if (!patch) return item;
			return { ...item, card: { ...item.card, ...patch } };
		});
	}, [rawDisplayList, optimisticCards]);

	// Clear optimistic patches when listener provides matching data
	useEffect(() => {
		if (optimisticCards.size === 0 || loading) return;
		setOptimisticCards((prev) => {
			const next = new Map(prev);
			for (const [tmdbId, patch] of prev) {
				const liveItem = items.find((i) => i.tmdbId === tmdbId);
				if (!liveItem) {
					next.delete(tmdbId);
					continue;
				}
				// Patch applied — listener has caught up when nextEpisode matches
				const patchEp = patch.nextEpisode;
				const liveEp = liveItem.nextEpisode;
				if (
					patchEp &&
					liveEp &&
					patchEp.season === liveEp.season &&
					patchEp.episode === liveEp.episode
				) {
					next.delete(tmdbId);
				}
			}
			return next.size === prev.size ? prev : next;
		});
	}, [items, optimisticCards, loading]);

	// --- Convert to ListItem for backward compat with renderItem ---
	const listData: ListItem[] = useMemo(() => {
		return displayList.map((item) => {
			if (item.type === "sectionHeader") return item;
			if (item.type === "watchedMovie") {
				const show = showMap.get(item.tmdbId);
				return {
					type: "watchedMovie" as const,
					movie: item.movie,
					show:
						show ??
						({
							tmdbId: item.tmdbId,
							title: item.showTitle,
							posterPath: item.posterPath,
							mediaType: MediaType.MOVIE,
						} as EnrichedTrackingItem),
				};
			}
			if (item.type === "watchedEpisode") {
				const show = showMap.get(item.tmdbId);
				return {
					type: "watchedEpisode" as const,
					episode: item.episode,
					show:
						show ??
						({
							tmdbId: item.tmdbId,
							title: item.showTitle,
							posterPath: item.posterPath,
						} as EnrichedTrackingItem),
				};
			}
			return {
				type: "show" as const,
				item: item.card as unknown as EnrichedTrackingItem,
			};
		});
	}, [displayList, showMap]);

	// --- Auto-load more if fewer visible items than cached ---
	useEffect(() => {
		const target = Math.max(10, cachedActiveCount.current);
		if (
			!loading &&
			hasMoreTracking &&
			!loadingMoreTracking &&
			sortedActive.length < target &&
			items.length > 0
		) {
			loadMoreTracking();
		}
	}, [
		loading,
		hasMoreTracking,
		loadingMoreTracking,
		sortedActive.length,
		items.length,
		loadMoreTracking,
	]);

	// Derive offset from actual display list (works with cache + live data)
	const prevWatchedOffset = useMemo(() => {
		const watchedCount = displayList.filter(
			(i) => i.type === "watchedEpisode" || i.type === "watchedMovie",
		).length;
		if (watchedCount === 0) return 0;
		// sectionHeader (40) + watchedCount items (99 each)
		return 40 + watchedCount * 99;
	}, [displayList]);

	const handleMarkWatched = useCallback(
		async (item: EnrichedTrackingItem) => {
			if (!userId) return;
			const card = item as any as CardItem;

			if (item.mediaType === MediaType.MOVIE) {
				setUpdatingShows((prev) => new Map(prev).set(item.tmdbId, MediaType.MOVIE));
				try {
					await markMovieWatched(userId, item.tmdbId, card.nextEpisodeRuntime ?? 0);
				} catch (err: any) {
					// Clear on failure so movie reappears in What's Up Next
					setUpdatingShows((prev) => {
						const next = new Map(prev);
						next.delete(item.tmdbId);
						return next;
					});
					console.error("markMovieWatched failed:", err);
					Alert.alert("Error", err.message || "Failed to mark as watched.");
					return;
				}
				// Keep updatingShows entry — spinner stays on card until listener
				// confirms status → COMPLETED (useEffect below clears it).
				// Cancel in-flight fetch only if data already loaded (avoids hiding
				// pre-existing movies). If still loading, the fetch will include our
				// movie since the batch already committed to Firestore.
				if (queryClient.getQueryData([QueryKey.WATCHED_MOVIES, userId])) {
					queryClient.cancelQueries({ queryKey: [QueryKey.WATCHED_MOVIES, userId] });
				}
				const movieNow = Timestamp.now();
				insertWatchedMovieCache(queryClient, userId, {
					id: `${item.tmdbId}_watched`,
					tmdbId: item.tmdbId,
					watchedAt: movieNow,
					lastWatchedAt: movieNow,
					runtime: card.nextEpisodeRuntime ?? 0,
					watchCount: 1,
					title: item.title,
					posterPath: item.posterPath,
				} as any);
				incrementDailyWatch("movie");
				emitShowCompleted({
					tmdbId: item.tmdbId,
					mediaType: MediaType.MOVIE,
					title: item.title,
					posterPath: item.posterPath,
					genres: item.catalogShow?.genres ?? [],
				});
				return;
			}

			const currentEp = item.nextEpisode ?? { season: 1, episode: 1 };
			const epKey = `${currentEp.season}-${currentEp.episode}`;
			setUpdatingShows((prev) => new Map(prev).set(item.tmdbId, epKey));

			// Read pre-computed fields from card — no catalog fetch needed
			const epTitle = card.nextEpisodeName || "";
			const epRuntime = card.nextEpisodeRuntime || 0;
			const nextEpisode = card.nextNextEpisode ?? null;
			const nextEpisodeName = card.nextNextEpisodeName ?? null;
			const nextEpisodeAirDate = card.nextNextEpisodeAirDate ?? null;
			const isComplete = card.isLastEpisode ?? false;

			// Optimistic upcoming update
			const upcomingSnapshot = mutateCachedUpcoming((prev) =>
				prev.filter(
					(ep) =>
						!(
							ep.tmdbShowId === item.tmdbId &&
							ep.season === currentEp.season &&
							ep.episode === currentEp.episode
						),
				),
			);

			try {
				await markEpisodeWatched(
					userId,
					item.tmdbId,
					currentEp.season,
					currentEp.episode,
					epTitle,
					epRuntime,
					nextEpisode,
					isComplete,
					false,
					nextEpisodeName,
					nextEpisodeAirDate,
				);

				// Optimistic UI: apply nextNext as new next immediately
				if (nextEpisode) {
					setOptimisticCards((prev) => {
						const next = new Map(prev);
						next.set(item.tmdbId, {
							nextEpisode,
							nextEpisodeName,
							nextEpisodeAirDate,
							nextEpisodeRuntime: card.nextNextEpisodeRuntime ?? 0,
							// nextNext will be null until listener re-enriches
							nextNextEpisode: null,
							nextNextEpisodeName: null,
							nextNextEpisodeAirDate: null,
							nextNextEpisodeRuntime: 0,
							isLastEpisode: false,
							isSeasonFinale: false,
						} as Partial<CardItem>);
						return next;
					});
				}

				// Spinner cleared by useEffect when listener confirms nextEpisode changed

				// Post-success: insert into query cache directly (no refetch)
				if (queryClient.getQueryData([QueryKey.WATCHED_EPISODES, userId, undefined])) {
					queryClient.cancelQueries({ queryKey: [QueryKey.WATCHED_EPISODES, userId, undefined] });
				}
				const epNow = Timestamp.now();
				insertWatchedEpisodeCache(queryClient, userId, {
					id: `${item.tmdbId}_S${String(currentEp.season).padStart(2, "0")}E${String(currentEp.episode).padStart(2, "0")}`,
					tmdbShowId: item.tmdbId,
					season: currentEp.season,
					episode: currentEp.episode,
					episodeTitle: epTitle,
					runtime: epRuntime,
					lastWatchedAt: epNow,
					watchedAt: epNow,
					watchCount: 1,
				});
				incrementDailyWatch("episode");
				if (isComplete) {
					emitShowCompleted({
						tmdbId: item.tmdbId,
						mediaType: MediaType.TV,
						title: item.title,
						posterPath: item.posterPath,
						genres: item.catalogShow?.genres ?? [],
					});
				}
			} catch (err: any) {
				rollbackUpcoming(upcomingSnapshot);
				setUpdatingShows((prev) => {
					const next = new Map(prev);
					next.delete(item.tmdbId);
					return next;
				});
				console.error("markEpisodeWatched failed:", err);
				Alert.alert("Error", err.message || "Failed to mark as watched.");
			}
		},
		[userId, queryClient, mutateCachedUpcoming, rollbackUpcoming],
	);

	const handleMarkWatchedThrough = useCallback(
		async (tmdbId: number, targetSeason: number, targetEpisode: number) => {
			if (!userId) return;
			const item = items.find((i) => i.tmdbId === tmdbId);
			if (!item || !item.catalogShow) return;

			const currentNext = item.nextEpisode ?? { season: 1, episode: 1 };
			const catalog = item.catalogShow;

			// Collect all episodes from currentNext through target
			const epsToMark: Array<{ season: number; episodeNumber: number; name: string; runtime: number }> = [];
			for (const s of catalog.seasons ?? []) {
				for (const e of s.episodes) {
					const isAfterStart =
						s.seasonNumber > currentNext.season ||
						(s.seasonNumber === currentNext.season && e.episodeNumber >= currentNext.episode);
					const isBeforeEnd =
						s.seasonNumber < targetSeason ||
						(s.seasonNumber === targetSeason && e.episodeNumber <= targetEpisode);
					if (isAfterStart && isBeforeEnd) {
						epsToMark.push({
							season: s.seasonNumber,
							episodeNumber: e.episodeNumber,
							name: e.title || "",
							runtime: e.runtime || 0,
						});
					}
				}
			}

			if (epsToMark.length === 0) return;

			// Find what comes after the target episode
			const nextAfterTarget = findNextEpisodeInCatalog(catalog, targetSeason, targetEpisode);
			const nextEpisode = nextAfterTarget ? { season: nextAfterTarget.season, episode: nextAfterTarget.episode } : null;
			const isComplete = !nextAfterTarget;

			// Group by season for markSeasonWatchedCF
			const bySeason = new Map<number, typeof epsToMark>();
			for (const ep of epsToMark) {
				const list = bySeason.get(ep.season) ?? [];
				list.push(ep);
				bySeason.set(ep.season, list);
			}

			// Mark each season batch — only last batch updates tracking doc
			const seasonEntries = [...bySeason.entries()];
			for (let i = 0; i < seasonEntries.length; i++) {
				const [sn, eps] = seasonEntries[i];
				const isLast = i === seasonEntries.length - 1;
				await markSeasonWatchedCF(
					tmdbId,
					sn,
					eps.map((e) => ({ episodeNumber: e.episodeNumber, name: e.name, runtime: e.runtime })),
					isLast ? nextEpisode : null,
					isLast ? isComplete : false,
					isLast ? (nextAfterTarget?.title ?? null) : null,
					isLast ? (nextAfterTarget?.airDate ?? null) : null,
				);
			}

			// Insert all into watched cache + update daily counter
			const now = Timestamp.now();
			for (const ep of epsToMark) {
				insertWatchedEpisodeCache(queryClient, userId, {
					id: `${tmdbId}_S${String(ep.season).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`,
					tmdbShowId: tmdbId,
					season: ep.season,
					episode: ep.episodeNumber,
					episodeTitle: ep.name,
					runtime: ep.runtime,
					lastWatchedAt: now,
					watchedAt: now,
					watchCount: 1,
				});
				incrementDailyWatch("episode");
			}
		},
		[userId, items, queryClient],
	);

	const handleUnmarkEpisode = useCallback(
		async (tmdbId: number, season: number, episode: number) => {
			if (!userId) return;
			const item = items.find((i) => i.tmdbId === tmdbId);
			const catalog = item?.catalogShow;
			const catalogSeason = catalog?.seasons?.find((s) => s.seasonNumber === season);
			const catalogEp = catalogSeason?.episodes?.find((e) => e.episodeNumber === episode);

			await unmarkEpisodeWatched(
				userId,
				tmdbId,
				season,
				episode,
				catalogEp?.runtime || 0,
				catalogEp?.title || null,
				catalogEp?.airDate || null,
			);
			removeWatchedEpisodeCache(queryClient, userId, tmdbId, season, episode);
			decrementDailyWatch("episode");
		},
		[userId, items, queryClient],
	);

	const handleCarouselMarkWatched = useCallback(
		async (tmdbId: number, season: number, episode: number) => {
			if (!userId) return;
			const item = items.find((i) => i.tmdbId === tmdbId);
			if (!item) return;
			const catalog = item.catalogShow;
			const catalogSeason = catalog?.seasons?.find((s) => s.seasonNumber === season);
			const catalogEp = catalogSeason?.episodes?.find((e) => e.episodeNumber === episode);
			const currentNext = item.nextEpisode ?? { season: 1, episode: 1 };

			// Only advance pointer if this is the current next episode
			const isCurrentNext = currentNext.season === season && currentNext.episode === episode;
			const skipTracking = !isCurrentNext;

			const nextInCatalog =
				isCurrentNext && catalog ? findNextEpisodeInCatalog(catalog, season, episode) : null;

			await markEpisodeWatched(
				userId,
				tmdbId,
				season,
				episode,
				catalogEp?.title || "",
				catalogEp?.runtime || 0,
				isCurrentNext
					? nextInCatalog
						? { season: nextInCatalog.season, episode: nextInCatalog.episode }
						: null
					: currentNext,
				isCurrentNext && !nextInCatalog,
				skipTracking,
				nextInCatalog?.title ?? null,
				nextInCatalog?.airDate ?? null,
			);

			const now = Timestamp.now();
			insertWatchedEpisodeCache(queryClient, userId, {
				id: `${tmdbId}_S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`,
				tmdbShowId: tmdbId,
				season,
				episode,
				episodeTitle: catalogEp?.title || "",
				runtime: catalogEp?.runtime || 0,
				lastWatchedAt: now,
				watchedAt: now,
				watchCount: 1,
			});
			incrementDailyWatch("episode");
		},
		[userId, items, queryClient],
	);

	// Safety timeout: clear stuck spinners after 15s
	useEffect(() => {
		if (updatingShows.size === 0) return;
		const timeout = setTimeout(() => {
			setUpdatingShows((prev) => (prev.size > 0 ? new Map() : prev));
		}, 15000);
		return () => clearTimeout(timeout);
	}, [updatingShows]);

	// Clear updating state when data changes
	useEffect(() => {
		if (updatingShows.size === 0) return;
		setUpdatingShows((prev) => {
			const next = new Map(prev);
			for (const [tmdbId, markedEpKey] of prev) {
				const item = items.find((i) => i.tmdbId === tmdbId);
				if (!item) {
					next.delete(tmdbId);
				} else if (markedEpKey === MediaType.MOVIE) {
					if (item.status === WatchStatus.COMPLETED) next.delete(tmdbId);
				} else {
					const ep = item.nextEpisode ?? { season: 1, episode: 1 };
					const currentKey = `${ep.season}-${ep.episode}`;
					if (currentKey !== markedEpKey) next.delete(tmdbId);
				}
			}
			return next.size === prev.size ? prev : next;
		});
	}, [items, updatingShows]);

	const handleStopWatching = useCallback(
		async (item: EnrichedTrackingItem) => {
			if (!userId) return;
			await stopWatching(userId, item.tmdbId, item.status, item.mediaType);
			removeItem(item.tmdbId);
			// Clean upcoming + calendar caches
			removeShowFromUpcoming(item.tmdbId);
			removeShowFromCalendarGlobal(item.tmdbId);
		},
		[userId, removeItem, removeShowFromUpcoming],
	);

	// Pull-to-refresh: load next page of both, catch-up effect handles the rest
	const hasMorePrevWatched = hasMoreEps || hasMoreMovies;
	const loadingMorePrevWatched = loadingMoreEps || loadingMoreMovies;
	const loadMorePrevWatched = useCallback(() => {
		if (volatilePrevWatched.length >= volatileCap) {
			setVolatileCap((c) => c + VOLATILE_PAGE);
		}
		if (hasMoreEps) loadMoreEps();
		if (hasMoreMovies) loadMoreMovies();
	}, [
		hasMoreEps,
		loadMoreEps,
		hasMoreMovies,
		loadMoreMovies,
		volatilePrevWatched.length,
		volatileCap,
	]);

	return {
		removeItem,
		listData,
		loading: effectiveLoading,
		loadMoreTracking,
		loadingMoreTracking,
		loadMorePrevWatched,
		loadingMorePrevWatched,
		hasMorePrevWatched,
		prevWatchedOffset,
		watchedCountByShow,
		updatingShows,
		handleMarkWatched,
		handleStopWatching,
		handleMarkWatchedThrough,
		handleUnmarkEpisode,
		handleCarouselMarkWatched,
	};
}
