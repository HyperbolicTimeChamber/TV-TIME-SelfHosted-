import { useMemo, useEffect, useCallback, useState, useRef } from "react";
import { Alert } from "react-native";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Timestamp } from "@react-native-firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	useWatchlist,
	EnrichedTrackingItem,
	getCachedCatalogShow,
	prefillCatalog,
	useWatchedEpisodes,
	useWatchedMovies,
	WATCHED_EPISODES_PAGE_SIZE,
	WATCHED_MOVIES_PAGE_SIZE,
	insertWatchedEpisodeCache,
	insertWatchedMovieCache,
	isShowVisible,
	sortByPriority,
	useUpcomingMutations,
	incrementDailyWatch,
	removeWatchedEpisodeCache,
	setWatchedEpisodeCountsCache,
	decrementDailyWatch,
} from "../../../hooks";
import {
	markEpisodeWatched,
	markMovieWatched,
	markSeasonWatchedCF,
	writeEpisodeWatchCount,
	stopWatching,
	removeFromTracking,
	skipRewatchEpisode,
} from "../../../services";
import { removeShowFromCalendarGlobal } from "../../../hooks/useCalendarEpisodes";
import {
	emitShowCompleted,
	emitShowRemoved,
	todayStr,
	pickEpisodeTitle,
	isFinaleEpisode,
	adjacentPointer,
} from "../../../utils";
import { mergeCachedShows, promoteShows } from "../../../utils/watchlistOrder";
import { coldStartHistory, safeHistory } from "../../../utils/watchedHistory";
import {
	MediaType,
	CacheKey,
	QueryKey,
	WatchStatus,
	WatchedEpisode,
	WatchedMovie,
} from "../../../types";
import type { WatchlistListItem } from "../../../types/watchlist";
import { nextEpisodeAirStamp } from "../../../utils/airTime";
import { fetchEpisodeRuntime } from "../../../services/tmdb";
import { useAuthStore } from "../../../stores";
import { batchEndOffsets, staggerFinishTimes } from "../../../utils/stagger";

/** Only schedule the air-time re-check for episodes airing within a day */
const AIR_RECHECK_MAX_MS = 86_400_000;
/** Between arming the card glide for cards reaching their air time and showing them: armed in
 *  the same commit as the move, the glide didn't run (the rows jumped) */
const AIR_ARM_LEAD_MS = 120;

const ACTIVE_CACHE_LIMIT = 100;

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

	const nextNext =
		nextEp && catalog ? findNextEpisodeInCatalog(catalog, nextEp.season, nextEp.episode) : null;

	return {
		...item,
		// Catalog first: the tracking doc's name is copied at mark time and goes stale when TMDB
		// corrects a title; the catalog is healed from fresh TMDB seasons (healCatalogSeason)
		nextEpisodeName: pickEpisodeTitle(catalogEp?.title, item.nextEpisodeName),
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
		// TMDB's explicit finale marker only (the last listed episode may just be the latest)
		isSeasonFinale: isFinaleEpisode(catalogEp),
	};
}

/** A card leaving "What's Up Next" this soon after its mark left because of it (the listener
 *  confirming the write takes a round trip; generous for a slow network) */
const JUST_MARKED_MS = 20_000;

/** A mark's client time vs the priority Firestore stores for it (a server timestamp may lag) */
const PROMOTE_CLOCK_SKEW_MS = 5000;

/** Puts a query's data back as it was before an optimistic insert. Empty before → the insert's
 *  seeded page is dropped (setQueryData(key, undefined) would be a no-op and leave it) */
function restoreQuery(queryClient: QueryClient, key: readonly unknown[], before: unknown) {
	if (before === undefined) queryClient.removeQueries({ queryKey: key, exact: true });
	else queryClient.setQueryData(key, before);
}

export type CardItem = ReturnType<typeof buildCardItem>;

/**
 * Daily reorder: cached cards whose next episode has aired since the cache was
 * written move to the top (any gap length). Their `remaining` is nulled — the
 * cache has no catalog; the live listener refills it.
 */
function reorderCachedList(
	list: CacheableWatchlistListItem[],
	today: string,
): CacheableWatchlistListItem[] {
	const prevWatchedHeader = list.find(
		(i) => i.type === "sectionHeader" && i.title === "Previously Watched",
	);
	const upNextHeader = list.find((i) => i.type === "sectionHeader" && i.title === "What's Up Next");
	const prevWatched = list.filter((i) => i.type === "watchedEpisode" || i.type === "watchedMovie");
	const showCards = list.filter((i) => i.type === "show") as Array<{
		type: "show";
		card: any;
	}>;

	const promoted: typeof showCards = [];
	const rest: typeof showCards = [];

	for (const item of showCards) {
		const card = item.card;
		const airDate = card.nextEpisodeAirDate;
		if (airDate && airDate <= today && card.nextEpisode) {
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

	const result: CacheableWatchlistListItem[] = [];
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
export type CacheableWatchlistListItem =
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
		healShown,
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
	const { mutateCachedUpcoming, rollbackUpcoming, removeShowFromUpcoming, removeWatchedFromPast } =
		useUpcomingMutations();
	const [updatingShows, setUpdatingShows] = useState<Map<number, string>>(new Map());
	// Optimistic card patches applied after Firestore write, before listener re-enriches
	const [optimisticCards, setOptimisticCards] = useState<Map<number, Partial<CardItem>>>(new Map());
	// Shows just marked → top of the list at once (tmdbId → when), before Firestore confirms the
	// new priority (~a round trip). The saved list carries it too: closing the app in that window
	// brought the card back in its old spot on the next launch, then it jumped up
	const [promoted, setPromoted] = useState<ReadonlyMap<number, number>>(new Map());
	// Bumped on every mark that lifts a card — the list animates card moves only right after one
	const [promotions, setPromotions] = useState(0);
	const promote = useCallback((tmdbId: number) => {
		setPromoted((prev) => new Map(prev).set(tmdbId, Date.now()));
		setPromotions((n) => n + 1);
	}, []);
	const unpromote = useCallback((tmdbId: number) => {
		setPromoted((prev) => {
			if (!prev.has(tmdbId)) return prev;
			const next = new Map(prev);
			next.delete(tmdbId);
			return next;
		});
	}, []);
	// Cards a mark just took off "What's Up Next" (nothing aired left to watch): hidden at once,
	// so the card leaves from where it is — lifted to the top until Firestore confirmed, it sat
	// there a round trip before going. Cleared once the live list drops it too, or the write fails
	const [leftUpNext, setLeftUpNext] = useState<ReadonlySet<number>>(new Set());
	const keepInUpNext = useCallback((tmdbId: number) => {
		setLeftUpNext((prev) => {
			if (!prev.has(tmdbId)) return prev;
			const next = new Set(prev);
			next.delete(tmdbId);
			return next;
		});
	}, []);
	// Titles just marked / unwatched from the list (tmdbId → when): a card or row that leaves or
	// joins the list soon after is that change's doing, and the list animates it (grow / shrink)
	const justMarked = useRef(new Map<number, number>());
	// Bumped by each noted change, before the list data moves: the list arms its card glide on
	// it (a transition switched on in the same commit as the move didn't animate it)
	const [listChangeArm, setListChangeArm] = useState(0);
	// Titles just paused / removed from the list (a long press): the card itself shrinks away,
	// not a mark's green "Watched" banner
	const justLeft = useRef(new Set<number>());
	const noteListChange = useCallback((tmdbId: number) => {
		justMarked.current.set(tmdbId, Date.now());
		justLeft.current.delete(tmdbId);
		setListChangeArm((n) => n + 1);
	}, []);
	const wasJustMarked = useCallback(
		(tmdbId: number) => Date.now() - (justMarked.current.get(tmdbId) ?? 0) < JUST_MARKED_MS,
		[],
	);
	const noteLeftList = useCallback(
		(tmdbId: number) => {
			noteListChange(tmdbId);
			justLeft.current.add(tmdbId);
		},
		[noteListChange],
	);
	const wasJustLeft = useCallback(
		(tmdbId: number) => justLeft.current.has(tmdbId) && wasJustMarked(tmdbId),
		[wasJustMarked],
	);
	// Pointer (`season-episode`) each patch was made from — the listener moving it anywhere else
	// (an unwatch, another screen) means the patch is stale
	const optimisticFrom = useRef(new Map<number, string>());

	// --- Cache: store and restore the display list directly ---
	const [cachedList, setCachedList] = useState<CacheableWatchlistListItem[] | null>(null);
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

	// Last session's confirmation that no tracking page is left — until this session's own
	// listeners confirm it, the list can already show the caught-up state instead of skeletons
	const [cachedExhausted, setCachedExhausted] = useState(false);
	useEffect(() => {
		if (!userId) return;
		AsyncStorage.getItem(CacheKey.WATCHLIST_EXHAUSTED)
			.then((raw) => {
				if (!raw) return;
				const cached = JSON.parse(raw);
				if (cached.userId === userId && cached.exhausted === true) setCachedExhausted(true);
			})
			.catch(() => {});
	}, [userId]);

	// --- Computed data from Firestore ---
	const showMap = useMemo(() => {
		const map = new Map<number, EnrichedTrackingItem>();
		for (const item of items) map.set(item.tmdbId, item);
		return map;
	}, [items]);

	/** Rewatch floor: no episode goes below the rewatch count (any status — the rewatch number
	 *  is the lowest count). − / swipe / Unwatch stop there; only the show page can go lower,
	 *  behind a "Reduce Rewatch" confirmation */
	const rewatchFloor = useCallback(
		(tmdbId: number) => showMap.get(tmdbId)?.rewatchCount ?? 0,
		[showMap],
	);

	/**
	 * Where a watch count change on one episode moves the watchlist pointer, by the run rule
	 * (adjacentPointer): an episode (with what its card shows), null (stays), or undefined when
	 * the show / its episode order isn't loaded, or it's completed → writeEpisodeWatchCount's
	 * legacy "back to this episode at a real 0". No reads: status, rewatch number, pointer and
	 * episode order are all cached
	 */
	const pointerFor = useCallback(
		(tmdbId: number, season: number, episode: number, from: number, to: number) => {
			const item = showMap.get(tmdbId);
			if (!item) return undefined;
			const status = item.status;
			const run =
				status === WatchStatus.WATCHING || status === WatchStatus.PAUSED
					? 1
					: status === WatchStatus.REWATCHING || status === WatchStatus.PAUSED_REWATCH
						? (item.rewatchCount ?? 0) + 1
						: null;
			if (run === null) return undefined;
			const catalog = item.catalogShow ?? getCachedCatalogShow(tmdbId, MediaType.TV);
			if (!catalog?.seasons?.length) return undefined;
			const seasons = catalog.seasons
				.filter((s) => s.seasonNumber > 0)
				.sort((x, y) => x.seasonNumber - y.seasonNumber);
			const order = seasons.flatMap((s) =>
				s.episodes.map((e) => ({ season: s.seasonNumber, episode: e.episodeNumber })),
			);
			const target = adjacentPointer(order, item.nextEpisode, { season, episode }, from, to, run);
			if (!target) return null;
			const info = seasons
				.find((s) => s.seasonNumber === target.season)
				?.episodes.find((e) => e.episodeNumber === target.episode);
			return { ...target, name: info?.title ?? null, airDate: info?.airDate ?? null };
		},
		[showMap],
	);

	/** Count a mark brings an episode to when the exact one isn't cached (see
	 *  insertWatchedEpisodeCache): the run under way (rewatch n → n + 1), else a first watch */
	const markedCount = useCallback(
		(tmdbId: number) => {
			const it = showMap.get(tmdbId);
			return it?.status === WatchStatus.REWATCHING || it?.status === WatchStatus.PAUSED_REWATCH
				? (it.rewatchCount ?? 0) + 1
				: 1;
		},
		[showMap],
	);

	const watchedCountByShow = useMemo(() => {
		const map = new Map<number, number>();
		for (const ep of watchedEps) {
			map.set(ep.tmdbShowId, (map.get(ep.tmdbShowId) || 0) + 1);
		}
		return map;
	}, [watchedEps]);

	// Re-check visibility when the next not-yet-aired episode reaches its air time (within a day)
	const [airClock, setAirClock] = useState(0);
	useEffect(() => {
		const now = Date.now();
		let next = Infinity;
		let showTimer: ReturnType<typeof setTimeout> | undefined;
		for (const item of items) {
			const stamp = nextEpisodeAirStamp(item.nextEpisode, item.catalogShow);
			const t = stamp ? Date.parse(stamp) : NaN;
			if (t > now && t < next) next = t;
		}
		if (next - now > AIR_RECHECK_MAX_MS) return;
		const timer = setTimeout(
			() => {
				// Cards this re-check brings into "What's Up Next" grow in (noted before the list sees
				// them — it picks its animations while rendering the new rows)
				for (const item of items) {
					if (!isShowVisible(item)) continue;
					const stamp = nextEpisodeAirStamp(item.nextEpisode, item.catalogShow);
					const t = stamp ? Date.parse(stamp) : NaN;
					if (t > now) noteListChange(item.tmdbId);
				}
				showTimer = setTimeout(() => setAirClock((c) => c + 1), AIR_ARM_LEAD_MS);
			},
			next - now + 1000,
		);
		return () => {
			clearTimeout(timer);
			clearTimeout(showTimer);
		};
	}, [items, airClock, noteListChange]);

	const sortedActive = useMemo(() => {
		const visible = items.filter((item) => isShowVisible(item));
		return sortByPriority(visible);
		// airClock: re-filter once an episode's air time passes
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [items, airClock]);

	// --- Build the display list with all fields baked in ---
	const today = todayStr();

	const PREV_WATCHED_CACHE_SIZE = 10;

	type PrevItem =
		| { kind: MediaType.TV; ep: WatchedEpisode; time: number }
		| { kind: MediaType.MOVIE; movie: WatchedMovie; time: number };

	const epHistory = useMemo<PrevItem[]>(
		() => watchedEps.map((ep) => ({ kind: MediaType.TV, ep, time: ep.lastWatchedAt?.toMillis?.() || 0 })),
		[watchedEps],
	);
	const movieHistory = useMemo<PrevItem[]>(
		() =>
			watchedMovies.map((movie) => ({
				kind: MediaType.MOVIE,
				movie,
				time: movie.lastWatchedAt?.toMillis?.() || 0,
			})),
		[watchedMovies],
	);
	// Only rows whose chronological place is confirmed (see safeHistory), oldest first
	const safePrevItems = useMemo(
		() => safeHistory(epHistory, movieHistory, hasMoreEps, hasMoreMovies),
		[epHistory, movieHistory, hasMoreEps, hasMoreMovies],
	);

	// Cached tier: newest PREV_WATCHED_CACHE_SIZE (persisted). Volatile tier: older pulled items
	// (cleared on restart), capped so marks made outside this tab don't grow the list unbounded;
	// the cap grows by VOLATILE_PAGE per pull-to-refresh. safePrevItems is ascending (tail = newest).
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
	}, [safePrevItems, MAX_VOLATILE]);
	// Older rows already loaded but past the cap: a pull shows them without a fetch
	const volatileOverflow = safePrevItems.length - PREV_WATCHED_CACHE_SIZE > volatileCap;

	const allLoading = loading || watchedEpsLoading || watchedMoviesLoading;

	// The oldest row shown stays the oldest: the section is a window of the newest rows, so
	// an unwatched row used to pull the next-older one in at the top (and a mark pushed the top
	// one out) — a row appearing / going above the view, which the list answered by scrolling.
	// Rows newer than the boundary all show (marks just add at the bottom); it moves only when
	// more are pulled in (pull to refresh → volatileCap)
	const shownFrom = useRef<{ time: number; cap: number } | null>(null);
	// A pull is waiting for its page: when the page lands the boundary moves up to take it in
	// (it was set when the pull bumped the cap, before the page arrived — the older rows stayed
	// hidden behind it and pull to refresh showed nothing)
	const pullOpen = useRef(false);
	// Already ascending — volatile (older) then cached (newer), newest at bottom
	const prevWatchedItems = useMemo(() => {
		const windowed = [...volatilePrevWatched, ...cachedPrevWatched];
		if (allLoading || windowed.length === 0) return windowed;
		const from = shownFrom.current;
		if (!from || from.cap !== volatileCap || (pullOpen.current && windowed[0].time < from.time)) {
			shownFrom.current = { time: windowed[0].time, cap: volatileCap };
			return windowed;
		}
		return safePrevItems.filter((i) => i.time >= from.time);
	}, [volatilePrevWatched, cachedPrevWatched, safePrevItems, allLoading, volatileCap]);

	// Previously Watched rows of a title that's neither on a loaded watchlist page nor in the
	// catalog cache drew a blank card (e.g. marked from its page, its tracking page not loaded).
	// Fill its catalog once — cached + persisted, so later launches label it with no read — then
	// rebuild the list
	const [catalogFillTick, setCatalogFillTick] = useState(0);
	useEffect(() => {
		for (const item of prevWatchedItems) {
			const [id, type] =
				item.kind === MediaType.MOVIE
					? [item.movie.tmdbId, MediaType.MOVIE]
					: [item.ep.tmdbShowId, MediaType.TV];
			if (showMap.has(id) || getCachedCatalogShow(id, type)) continue;
			prefillCatalog(id, type).then((catalog) => {
				if (catalog) setCatalogFillTick((t) => t + 1);
			});
		}
	}, [prevWatchedItems, showMap]);

	const liveList: CacheableWatchlistListItem[] = useMemo(() => {
		if (allLoading) return [];
		const result: CacheableWatchlistListItem[] = [];
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
						posterPath:
							show?.posterPath ?? cat?.posterPath ?? (item.movie as any).posterPath ?? null,
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
		// eslint-disable-next-line react-hooks/exhaustive-deps -- catalogFillTick: rebuild once a fill lands
	}, [allLoading, prevWatchedItems, sortedActive, showMap, today, catalogFillTick]);

	const orderedLive = useMemo(() => promoteShows(liveList, promoted), [liveList, promoted]);

	// Firestore's own order has caught up (priority at least the mark's) → drop the promotion
	useEffect(() => {
		if (promoted.size === 0) return;
		for (const [tmdbId, at] of promoted) {
			const live = items.find((i) => i.tmdbId === tmdbId);
			const ms = live?.priorityDate?.toMillis?.() ?? 0;
			if (!live || ms >= at - PROMOTE_CLOCK_SKEW_MS) unpromote(tmdbId);
		}
	}, [items, promoted, unpromote]);

	// The live pages have caught up with last session's list (or there are no more pages): the
	// saved cards can stop holding the bottom of the list
	const liveCaughtUp = !hasMoreTracking || sortedActive.length >= cachedActiveCount.current;

	// --- Persist list cache when live data updates (only cached tier, not volatile) ---
	useEffect(() => {
		if (!userId || allLoading || orderedLive.length === 0) return;
		// Live shows still arriving: saving now would shrink the saved list to the first pages
		if (cachedList && !liveCaughtUp) return;

		// Cache: newest PREV_WATCHED_CACHE_SIZE watched items + the show cards
		const cacheList: CacheableWatchlistListItem[] = [];
		// Only rows a cold start loads too: this session's history pages can hold more than a
		// fresh first page (a mark adds its row), and a saved row the live list then lacked
		// vanished above the view a moment after launch — the list jumped by a row
		const freshRows = new Set<WatchedEpisode | WatchedMovie>(
			coldStartHistory(
				epHistory,
				movieHistory,
				hasMoreEps,
				hasMoreMovies,
				WATCHED_EPISODES_PAGE_SIZE,
				WATCHED_MOVIES_PAGE_SIZE,
			).map((i) => (i.kind === MediaType.TV ? i.ep : i.movie)),
		);
		const cachedWatchedItems = orderedLive.filter(
			(i) =>
				(i.type === "watchedEpisode" && freshRows.has(i.episode)) ||
				(i.type === "watchedMovie" && freshRows.has(i.movie)),
		);
		const cachedOnly = cachedWatchedItems.slice(-PREV_WATCHED_CACHE_SIZE);
		if (cachedOnly.length > 0) {
			cacheList.push({ type: "sectionHeader", title: "Previously Watched" });
			cacheList.push(...cachedOnly);
		}
		// Show cards without catalogShow (too big to persist)
		const showItems = orderedLive.filter((i) => i.type === "show");
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
	}, [userId, allLoading, orderedLive, cachedList, liveCaughtUp, epHistory, movieHistory, hasMoreEps, hasMoreMovies]);

	// Confirmed by the live listeners: first load done, no page pending, none left
	const liveExhausted = !allLoading && !loadingMoreTracking && !hasMoreTracking;
	useEffect(() => {
		if (!userId || allLoading || loadingMoreTracking) return;
		AsyncStorage.setItem(
			CacheKey.WATCHLIST_EXHAUSTED,
			JSON.stringify({ userId, exhausted: !hasMoreTracking }),
		).catch(() => {});
	}, [userId, allLoading, loadingMoreTracking, hasMoreTracking]);

	// --- Effective display: blend cached shows + live previously watched ---
	const rawDisplayList = useMemo(() => {
		if (!cachedList) return orderedLive;
		if (orderedLive.length === 0) return cachedList;
		// Live pages arrive a few at a time: the saved cards they haven't reached yet keep their
		// saved spot, so the list doesn't shrink to the first page and grow back (cards vanishing,
		// then returning). They drop out as the live ones take over (liveCaughtUp)
		return mergeCachedShows(cachedList, orderedLive);
	}, [cachedList, orderedLive]);
	const effectiveLoading = reordering || (allLoading && !cachedList);

	// Apply optimistic card patches (and hide cards a mark just took off — leftUpNext)
	const displayList = useMemo(() => {
		const shown =
			leftUpNext.size === 0
				? rawDisplayList
				: rawDisplayList.filter((i) => i.type !== "show" || !leftUpNext.has(i.card.tmdbId));
		if (optimisticCards.size === 0) return shown;
		return shown.map((item) => {
			if (item.type !== "show") return item;
			const patch = optimisticCards.get(item.card.tmdbId);
			if (!patch) return item;
			return { ...item, card: { ...item.card, ...patch } };
		});
	}, [rawDisplayList, optimisticCards, leftUpNext]);

	// The live list caught up (the card's gone from it too) → stop hiding it, so a later unwatch
	// brings it back
	useEffect(() => {
		if (leftUpNext.size === 0) return;
		const live = new Set(sortedActive.map((i) => i.tmdbId));
		const confirmed = [...leftUpNext].filter((id) => !live.has(id));
		if (confirmed.length === 0) return;
		setLeftUpNext((prev) => {
			const next = new Set(prev);
			for (const id of confirmed) next.delete(id);
			return next;
		});
	}, [sortedActive, leftUpNext]);

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
				const liveKey = liveEp ? `${liveEp.season}-${liveEp.episode}` : null;
				const patchKey = patchEp ? `${patchEp.season}-${patchEp.episode}` : null;
				const from = optimisticFrom.current.get(tmdbId);
				// Stale: the pointer went somewhere else than before / after this patch. Kept, the
				// card showed the patch's episode and the next tap marked that one
				const movedElsewhere = !!from && liveKey !== from && liveKey !== patchKey;
				if ((patchKey && patchKey === liveKey) || movedElsewhere) {
					next.delete(tmdbId);
					optimisticFrom.current.delete(tmdbId);
				}
			}
			return next.size === prev.size ? prev : next;
		});
	}, [items, optimisticCards, loading]);

	// --- Convert to WatchlistListItem for renderItem ---
	const listData: WatchlistListItem[] = useMemo(() => {
		return displayList.map((item) => {
			if (item.type === "sectionHeader") return item;
			if (item.type === "watchedMovie") {
				const show =
					showMap.get(item.tmdbId) ??
					({
						tmdbId: item.tmdbId,
						title: item.showTitle,
						posterPath: item.posterPath,
						mediaType: MediaType.MOVIE,
						catalogShow: getCachedCatalogShow(item.tmdbId, MediaType.MOVIE),
					} as EnrichedTrackingItem);
				return {
					type: "watchedMovie" as const,
					movie: item.movie,
					// Tracking docs of movies added via "mark watched" store releaseDate null —
					// fall back to the catalog like active cards do (buildCardItem)
					show: {
						...show,
						releaseDate: show.releaseDate ?? show.catalogShow?.releaseDate ?? null,
					},
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
			noteListChange(item.tmdbId);
			// One frame for the list to arm its glide before this mark moves the cards
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			const card = item as any as CardItem;

			if (item.mediaType === MediaType.MOVIE) {
				setUpdatingShows((prev) => new Map(prev).set(item.tmdbId, MediaType.MOVIE));
				// Watched → off "What's Up Next" now (see leftUpNext)
				setLeftUpNext((prev) => new Set(prev).add(item.tmdbId));
				// Previously Watched row first (optimistic, like the watch count sheet), not after
				// the write's server ack: the row used to land a round trip after the tap.
				// Cancel an in-flight fetch only if data is already loaded — a first load
				// includes this movie anyway.
				const moviesKey = [QueryKey.WATCHED_MOVIES, userId];
				const moviesBefore = queryClient.getQueryData(moviesKey);
				if (moviesBefore) queryClient.cancelQueries({ queryKey: moviesKey });
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
				try {
					await markMovieWatched(userId, item.tmdbId, card.nextEpisodeRuntime ?? 0);
				} catch (err: any) {
					// Clear on failure so movie reappears in What's Up Next, and its row goes
					restoreQuery(queryClient, moviesKey, moviesBefore);
					keepInUpNext(item.tmdbId);
					setUpdatingShows((prev) => {
						const next = new Map(prev);
						next.delete(item.tmdbId);
						return next;
					});
					console.error("markMovieWatched failed:", err);
					Alert.alert("Error", err.message || "Failed to mark as watched.");
					return;
				}
				// Spinner stays until the listener confirms COMPLETED (effect below clears it).
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
			// Card runtime comes from the stored catalog; a just-aired episode may not have one yet
			const epRuntime =
				card.nextEpisodeRuntime ||
				(await fetchEpisodeRuntime(
					useAuthStore.getState().appTmdbApiKey,
					item.tmdbId,
					currentEp.season,
					currentEp.episode,
				));
			// What comes next, from the catalog at mark time — not the card's pre-computed fields:
			// a card still showing an optimistic patch has none (a fast second mark once wrote
			// nextEpisode: null with episodes left, and the card lost its pointer for good)
			const catalog = item.catalogShow?.seasons?.length
				? item.catalogShow
				: getCachedCatalogShow(item.tmdbId, MediaType.TV);
			const hasSeasons = !!catalog?.seasons?.length;
			const after = hasSeasons
				? findNextEpisodeInCatalog(catalog, currentEp.season, currentEp.episode)
				: null;
			const nextEpisode = after
				? { season: after.season, episode: after.episode }
				: (card.nextNextEpisode ?? null);
			const nextEpisodeName = after ? after.title : (card.nextNextEpisodeName ?? null);
			const nextEpisodeAirDate = after ? after.airDate : (card.nextNextEpisodeAirDate ?? null);
			const nextEpisodeRuntime = after ? after.runtime : (card.nextNextEpisodeRuntime ?? 0);
			// Last only when the catalog says so (no catalog → never completed on a guess)
			const isComplete = hasSeasons && !nextEpisode;
			// The episode after the new pointer, so the patched card can be marked again at once
			const afterNext =
				hasSeasons && nextEpisode
					? findNextEpisodeInCatalog(catalog, nextEpisode.season, nextEpisode.episode)
					: null;

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

			// Nothing aired left after this one (finale, next not out yet) → the card leaves from
			// where it is; otherwise it goes to the top with its next episode
			const leaves = !isShowVisible({
				...item,
				nextEpisode,
				nextEpisodeAirDate,
				status: isComplete ? WatchStatus.COMPLETED : item.status,
			});
			if (leaves) setLeftUpNext((prev) => new Set(prev).add(item.tmdbId));
			else promote(item.tmdbId);
			// Previously Watched row now, with the Upcoming removal above — not after the write's
			// server ack (the card left Upcoming at once and its row landed a round trip later).
			// A failed write restores both caches as they were.
			const allEpsKey = [QueryKey.WATCHED_EPISODES, userId, undefined];
			const showEpsKey = [QueryKey.WATCHED_EPISODES, userId, item.tmdbId];
			const allEpsBefore = queryClient.getQueryData(allEpsKey);
			const showEpsBefore = queryClient.getQueryData(showEpsKey);
			if (allEpsBefore) queryClient.cancelQueries({ queryKey: allEpsKey });
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
				watchCount: markedCount(item.tmdbId),
			});
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
					optimisticFrom.current.set(item.tmdbId, epKey);
					setOptimisticCards((prev) => {
						const next = new Map(prev);
						next.set(item.tmdbId, {
							nextEpisode,
							nextEpisodeName,
							nextEpisodeAirDate,
							nextEpisodeRuntime,
							nextNextEpisode: afterNext
								? { season: afterNext.season, episode: afterNext.episode }
								: null,
							nextNextEpisodeName: afterNext?.title ?? null,
							nextNextEpisodeAirDate: afterNext?.airDate ?? null,
							nextNextEpisodeRuntime: afterNext?.runtime ?? 0,
							isLastEpisode: hasSeasons && !afterNext,
							isSeasonFinale: false,
						} as Partial<CardItem>);
						return next;
					});
				}

				// Spinner cleared by useEffect when listener confirms nextEpisode changed
				incrementDailyWatch("episode");
				removeWatchedFromPast(item.tmdbId, currentEp.season, currentEp.episode);
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
				unpromote(item.tmdbId);
				keepInUpNext(item.tmdbId);
				rollbackUpcoming(upcomingSnapshot);
				restoreQuery(queryClient, allEpsKey, allEpsBefore);
				restoreQuery(queryClient, showEpsKey, showEpsBefore);
				setUpdatingShows((prev) => {
					const next = new Map(prev);
					next.delete(item.tmdbId);
					return next;
				});
				console.error("markEpisodeWatched failed:", err);
				Alert.alert("Error", err.message || "Failed to mark as watched.");
			}
		},
		[
			noteListChange,
			keepInUpNext,
			userId,
			promote,
			unpromote,
			queryClient,
			mutateCachedUpcoming,
			rollbackUpcoming,
			removeWatchedFromPast,
			markedCount,
		],
	);

	const handleMarkWatchedThrough = useCallback(
		async (tmdbId: number, targetSeason: number, targetEpisode: number) => {
			if (!userId) return;
			const item = items.find((i) => i.tmdbId === tmdbId);
			if (!item || !item.catalogShow) return;

			const currentNext = item.nextEpisode ?? { season: 1, episode: 1 };
			const catalog = item.catalogShow;

			// Collect all episodes from currentNext through target
			const epsToMark: Array<{
				season: number;
				episodeNumber: number;
				name: string;
				runtime: number;
			}> = [];
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
			const nextEpisode = nextAfterTarget
				? { season: nextAfterTarget.season, episode: nextAfterTarget.episode }
				: null;
			const isComplete = !nextAfterTarget;

			// Group by season for markSeasonWatchedCF
			const bySeason = new Map<number, typeof epsToMark>();
			for (const ep of epsToMark) {
				const list = bySeason.get(ep.season) ?? [];
				list.push(ep);
				bySeason.set(ep.season, list);
			}

			// Mark each season batch — only last batch updates tracking doc. The Speedster backfill
			// is packed: a second apart, ending now (oldest first), so the whole catch-up reads as
			// just watched — runtime gaps put E1… hours back, behind other recent marks
			const seasonEntries = [...bySeason.entries()].sort(([a], [b]) => a - b);
			const endOffsets = batchEndOffsets(
				seasonEntries.map(([, eps]) => eps.map((e) => e.runtime || 0)),
				true,
			);
			promote(tmdbId);
			for (let i = 0; i < seasonEntries.length; i++) {
				const [sn, eps] = seasonEntries[i];
				const isLast = i === seasonEntries.length - 1;
				await markSeasonWatchedCF(
					userId,
					tmdbId,
					sn,
					eps.map((e) => ({ episodeNumber: e.episodeNumber, name: e.name, runtime: e.runtime })),
					isLast ? nextEpisode : null,
					isLast ? isComplete : false,
					isLast ? (nextAfterTarget?.title ?? null) : null,
					isLast ? (nextAfterTarget?.airDate ?? null) : null,
					{ endOffsetMs: endOffsets[i], packed: true },
				).catch((err) => {
					unpromote(tmdbId);
					throw err;
				});
			}

			// Insert all into watched cache + update daily counter, at the same back-to-back finish
			// times the function stores (each season ending where the next starts)
			const nowMs = Date.now();
			for (let i = 0; i < seasonEntries.length; i++) {
				const ordered = [...seasonEntries[i][1]].sort((a, b) => a.episodeNumber - b.episodeNumber);
				const finished = staggerFinishTimes(
					ordered.map((e) => e.runtime || 0),
					nowMs - endOffsets[i],
					true,
				);
				ordered.forEach((ep, k) => {
					const at = Timestamp.fromMillis(finished[k]);
					insertWatchedEpisodeCache(queryClient, userId, {
						id: `${tmdbId}_S${String(ep.season).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`,
						tmdbShowId: tmdbId,
						season: ep.season,
						episode: ep.episodeNumber,
						episodeTitle: ep.name,
						runtime: ep.runtime,
						lastWatchedAt: at,
						watchedAt: at,
						watchCount: markedCount(tmdbId),
					});
					incrementDailyWatch("episode", finished[k]);
				});
			}
		},
		[userId, items, queryClient, markedCount, promote, unpromote],
	);

	const handleUnmarkEpisode = useCallback(
		async (tmdbId: number, season: number, episode: number) => {
			if (!userId) return;
			noteListChange(tmdbId);
			const item = items.find((i) => i.tmdbId === tmdbId);
			const catalog = item?.catalogShow;
			const catalogSeason = catalog?.seasons?.find((s) => s.seasonNumber === season);
			const catalogEp = catalogSeason?.episodes?.find((e) => e.episodeNumber === episode);
			const known = item
				? { status: item.status, rewatchCount: item.rewatchCount ?? 0 }
				: undefined;
			// Carousel Unwatch takes one watch off (its card shows the count dropping by one)
			const count =
				queryClient
					.getQueryData<WatchedEpisode[]>([QueryKey.WATCHED_EPISODES, userId, tmdbId])
					?.find((e) => e.season === season && e.episode === episode)?.watchCount ?? 1;
			// Mid-rewatch never below the rewatch number: earlier runs' watches stay, so stepping
			// back through the carousel unwatching can't end the rewatch
			if (count <= rewatchFloor(tmdbId)) return;
			const pointer = pointerFor(tmdbId, season, episode, count, count - 1);

			// Off the real count (read first): a stale cached count can't delete watches
			let restoredTo: Timestamp | null = null;
			const final = await writeEpisodeWatchCount(
				userId,
				tmdbId,
				{
					season,
					episode,
					title: catalogEp?.title || "",
					runtime: catalogEp?.runtime || 0,
					airDate: catalogEp?.airDate || null,
				},
				count,
				count - 1,
				known,
				pointer,
				undefined,
				(at) => {
					restoredTo = at;
				},
			);
			decrementDailyWatch("episode");
			if (final > 0) {
				// Put back to the watch before the undone play → its row goes back to that place
				setWatchedEpisodeCountsCache(
					queryClient,
					userId,
					tmdbId,
					new Map([[`${season}_${episode}`, final]]),
					restoredTo ?? undefined,
				);
			} else {
				removeWatchedEpisodeCache(queryClient, userId, tmdbId, season, episode);
			}
			// The write pointed the watchlist back at this episode (run rule, or a real 0 without
			// one) — show it on the card now, and replace a mark's patch that would otherwise keep
			// showing the old next episode
			const movedBack = pointer
				? pointer.season === season && pointer.episode === episode
				: pointer === undefined && final <= 0;
			if (movedBack && item?.nextEpisode) {
				const after = catalog ? findNextEpisodeInCatalog(catalog, season, episode) : null;
				const inRewatch =
					item.status === WatchStatus.REWATCHING || item.status === WatchStatus.PAUSED_REWATCH;
				optimisticFrom.current.set(
					tmdbId,
					`${item.nextEpisode.season}-${item.nextEpisode.episode}`,
				);
				setOptimisticCards((prev) =>
					new Map(prev).set(tmdbId, {
						nextEpisode: { season, episode },
						nextEpisodeName: catalogEp?.title || null,
						nextEpisodeAirDate: catalogEp?.airDate || null,
						nextEpisodeRuntime: catalogEp?.runtime || 0,
						nextNextEpisode: after ? { season: after.season, episode: after.episode } : null,
						nextNextEpisodeName: after?.title ?? null,
						nextNextEpisodeAirDate: after?.airDate ?? null,
						nextNextEpisodeRuntime: after?.runtime ?? 0,
						isLastEpisode: !after,
						isSeasonFinale: false,
						// A rewatch stays a rewatch; otherwise it's a first watch again
						status: inRewatch ? item.status : WatchStatus.WATCHING,
					} as Partial<CardItem>),
				);
			}
		},
		[noteListChange, userId, items, queryClient, rewatchFloor, pointerFor],
	);

	const handleCarouselMarkWatched = useCallback(
		async (tmdbId: number, season: number, episode: number, cardRuntime?: number | null) => {
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
				// A fresh episode can lack a runtime in the stored catalog: the card's (TMDB) one,
				// else ask TMDB — or the watch counts 0 minutes ("N/A") until the next sync
				catalogEp?.runtime ||
					cardRuntime ||
					(await fetchEpisodeRuntime(
						useAuthStore.getState().appTmdbApiKey,
						tmdbId,
						season,
						episode,
					)),
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
				watchCount: markedCount(tmdbId),
			});
			incrementDailyWatch("episode");
		},
		[userId, items, queryClient, markedCount],
	);

	/** Rewatch only: skip the current episode — pointer moves on, nothing marked watched */
	const handleSkipEpisode = useCallback(
		async (tmdbId: number, season: number, episode: number) => {
			if (!userId) return;
			const item = items.find((i) => i.tmdbId === tmdbId);
			if (!item || item.status !== WatchStatus.REWATCHING) return;
			const cur = item.nextEpisode;
			if (!cur || cur.season !== season || cur.episode !== episode) return;

			const next = item.catalogShow
				? findNextEpisodeInCatalog(item.catalogShow, season, episode)
				: null;
			const nextEpisode = next ? { season: next.season, episode: next.episode } : null;
			try {
				await skipRewatchEpisode(
					userId,
					tmdbId,
					nextEpisode,
					next?.title ?? null,
					next?.airDate ?? null,
				);
			} catch (err: any) {
				Alert.alert("Error", err.message || "Failed to skip episode.");
				return;
			}
			if (nextEpisode) {
				const after = findNextEpisodeInCatalog(item.catalogShow, next!.season, next!.episode);
				optimisticFrom.current.set(tmdbId, `${season}-${episode}`);
				setOptimisticCards((prev) =>
					new Map(prev).set(tmdbId, {
						nextEpisode,
						nextEpisodeName: next!.title,
						nextEpisodeAirDate: next!.airDate,
						nextEpisodeRuntime: next!.runtime,
						nextNextEpisode: after ? { season: after.season, episode: after.episode } : null,
						nextNextEpisodeName: after?.title ?? null,
						nextNextEpisodeAirDate: after?.airDate ?? null,
						nextNextEpisodeRuntime: after?.runtime ?? 0,
						isLastEpisode: !after,
						isSeasonFinale: false,
					} as Partial<CardItem>),
				);
			}
			return nextEpisode;
		},
		[userId, items],
	);

	// Safety timeout: clear stuck spinners after 15s
	useEffect(() => {
		if (updatingShows.size === 0) return;
		const timeout = setTimeout(() => {
			setUpdatingShows((prev) => (prev.size > 0 ? new Map() : prev));
		}, 15000);
		return () => clearTimeout(timeout);
	}, [updatingShows]);

	// Clear spinners once the listener confirms the mark
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
			// Noted before the write, in a render of its own: the card then leaves shrinking (app
			// listMotion; web reads its exit animation from the card's last render before removal)
			noteLeftList(item.tmdbId);
			await stopWatching(userId, item.tmdbId, item.status, item.mediaType);
			removeItem(item.tmdbId);
			// Clean upcoming + calendar caches
			removeShowFromUpcoming(item.tmdbId);
			removeShowFromCalendarGlobal(item.tmdbId);
		},
		[userId, removeItem, removeShowFromUpcoming, noteLeftList],
	);

	// A movie on "What's Up Next" (not watched yet) can't be paused — it has no episodes to
	// come back to. Its long press removes it from tracking instead (as its page's Remove)
	const handleRemoveFromWatchlist = useCallback(
		async (item: EnrichedTrackingItem) => {
			if (!userId) return;
			noteLeftList(item.tmdbId);
			await removeFromTracking(userId, item.tmdbId, item.mediaType);
			removeItem(item.tmdbId);
			removeShowFromUpcoming(item.tmdbId);
			removeShowFromCalendarGlobal(item.tmdbId);
			emitShowRemoved(item.tmdbId);
		},
		[userId, removeItem, removeShowFromUpcoming, noteLeftList],
	);

	// Pull-to-refresh: load the next page of both lists
	const hasMorePrevWatched = hasMoreEps || hasMoreMovies || volatileOverflow;
	const loadingMorePrevWatched = loadingMoreEps || loadingMoreMovies;
	// The pull's page is in (or there was none to fetch): the boundary holds again
	useEffect(() => {
		if (!loadingMorePrevWatched) pullOpen.current = false;
	}, [loadingMorePrevWatched]);
	const loadMorePrevWatched = useCallback(() => {
		pullOpen.current = true;
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
		handleRemoveFromWatchlist,
		/** Cards that stayed on screen → heal their missing data (see useWatchlist) */
		healShown,
		listData,
		promotions,
		wasJustMarked,
		wasJustLeft,
		noteListChange,
		listChangeArm,
		loading: effectiveLoading,
		// Everything fetched (confirmed now, or by the last session while this one still loads):
		// only then can an empty "What's Up Next" really mean "all caught up". Until then the
		// footer is skeletons — never blank
		listSettled: liveExhausted || (allLoading && cachedExhausted),
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
		handleSkipEpisode,
		rewatchFloor,
		pointerFor,
		/** Loaded tracking items by tmdbId (status for the watch count sheet) */
		showMap,
	};
}
