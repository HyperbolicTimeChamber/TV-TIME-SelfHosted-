import { useMemo, useEffect, useCallback, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useWatchlist,
  EnrichedTrackingItem,
  useWatchedEpisodes,
  isShowVisible,
  sortByPriority,
  useUpcomingMutations,
} from "../../../hooks";
import {
  markEpisodeWatched,
  markMovieWatched,
  stopWatching,
} from "../../../services";
import { MediaType, CacheKey, WatchedEpisode, QueryKey } from "../../../types";
import { ListItem } from "./types";

const ACTIVE_CACHE_LIMIT = 100;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Compute remaining aired episodes after nextEp */
function computeRemaining(
  item: EnrichedTrackingItem,
  today: string,
): number | null {
  const nextEp = item.nextEpisode;
  const catalog = item.catalogShow;
  if (!nextEp || !catalog?.seasons) return null;
  let count = 0;
  for (const s of catalog.seasons) {
    if (s.seasonNumber < nextEp.season) continue;
    for (const e of s.episodes) {
      if (
        s.seasonNumber === nextEp.season &&
        e.episodeNumber <= nextEp.episode
      )
        continue;
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
): { season: number; episode: number; title: string | null; airDate: string | null; runtime: number } | null {
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
  const catalogEp = catalogSeason?.episodes?.find(
    (e: any) => e.episodeNumber === nextEp?.episode,
  );

  // Compute nextNext episode (what comes after the current next)
  const nextNext = nextEp && catalog
    ? findNextEpisodeInCatalog(catalog, nextEp.season, nextEp.episode)
    : null;

  return {
    ...item,
    nextEpisodeName: item.nextEpisodeName || catalogEp?.title || null,
    nextEpisodeAirDate: item.nextEpisodeAirDate ?? catalogEp?.airDate ?? null,
    nextEpisodeRuntime: catalogEp?.runtime || 0,
    releaseDate: item.releaseDate ?? catalog?.releaseDate ?? null,
    remaining: computeRemaining(item, today),
    // Pre-computed next-next for optimistic mark watched
    nextNextEpisode: nextNext ? { season: nextNext.season, episode: nextNext.episode } : null,
    nextNextEpisodeName: nextNext?.title ?? null,
    nextNextEpisodeAirDate: nextNext?.airDate ?? null,
    nextNextEpisodeRuntime: nextNext?.runtime ?? 0,
    isLastEpisode: nextEp != null && !nextNext,
  };
}

export type CardItem = ReturnType<typeof buildCardItem>;

/** Serializable list item for caching */
export type CacheableListItem =
  | { type: "sectionHeader"; title: string }
  | { type: "show"; card: CardItem }
  | { type: "watchedEpisode"; episode: WatchedEpisode; showTitle: string; posterPath: string | null; tmdbId: number };

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
    loadMore: loadMoreEps,
    loadingMore: loadingMoreEps,
    hasMore: hasMoreEps,
  } = useWatchedEpisodes(userId);

  const queryClient = useQueryClient();
  const { mutateCachedUpcoming, rollbackUpcoming } = useUpcomingMutations();
  const [updatingShows, setUpdatingShows] = useState<Map<number, string>>(
    new Map(),
  );

  // --- Cache: store and restore the display list directly ---
  const [cachedList, setCachedList] = useState<CacheableListItem[] | null>(null);
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
        if (
          cached.userId === userId &&
          cached.date === todayStr() &&
          cached.list?.length > 0
        ) {
          setCachedList(cached.list);
          cachedActiveCount.current = cached.list.filter(
            (i: any) => i.type === "show",
          ).length;
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

  const sortedWatchedEps = useMemo(
    () =>
      [...watchedEps].sort((a, b) => {
        const aTime = a.lastWatchedAt?.toMillis?.() || 0;
        const bTime = b.lastWatchedAt?.toMillis?.() || 0;
        return aTime - bTime;
      }),
    [watchedEps],
  );

  const sortedActive = useMemo(() => {
    const visible = items.filter((item) => isShowVisible(item));
    return sortByPriority(visible);
  }, [items]);

  // --- Build the display list with all fields baked in ---
  const today = todayStr();
  const liveList: CacheableListItem[] = useMemo(() => {
    if (loading) return [];
    const result: CacheableListItem[] = [];
    if (sortedWatchedEps.length > 0) {
      result.push({ type: "sectionHeader", title: "Previously Watched" });
      for (const ep of sortedWatchedEps) {
        const show = showMap.get(ep.tmdbShowId);
        if (show) {
          result.push({
            type: "watchedEpisode",
            episode: ep,
            showTitle: show.title,
            posterPath: show.posterPath,
            tmdbId: show.tmdbId,
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
  }, [loading, sortedWatchedEps, sortedActive, showMap, today]);

  // --- Persist list cache when live data updates ---
  useEffect(() => {
    if (!userId || loading || liveList.length === 0) return;
    // Strip catalogShow from cards before caching
    const toCache = liveList.map((item) => {
      if (item.type === "show") {
        const { catalogShow, ...rest } = item.card;
        return { type: "show" as const, card: rest };
      }
      return item;
    });
    AsyncStorage.setItem(
      CacheKey.WATCHLIST_ACTIVE,
      JSON.stringify({ userId, date: todayStr(), list: toCache }),
    ).catch(() => {});
    if (cachedList) setCachedList(null);
  }, [userId, loading, liveList]);

  // --- Effective display: cached until live data ready ---
  const displayList = cachedList && liveList.length === 0 ? cachedList : liveList;
  const effectiveLoading = loading && !cachedList;

  // --- Convert to ListItem for backward compat with renderItem ---
  const listData: ListItem[] = useMemo(() => {
    return displayList.map((item) => {
      if (item.type === "sectionHeader") return item;
      if (item.type === "watchedEpisode") {
        const show = showMap.get(item.tmdbId);
        return {
          type: "watchedEpisode" as const,
          episode: item.episode,
          show: show ?? ({
            tmdbId: item.tmdbId,
            title: item.showTitle,
            posterPath: item.posterPath,
          } as EnrichedTrackingItem),
        };
      }
      return { type: "show" as const, item: item.card as unknown as EnrichedTrackingItem };
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

  const watchedItemCount = useMemo(() => {
    return sortedWatchedEps.filter((ep) => showMap.has(ep.tmdbShowId)).length;
  }, [sortedWatchedEps, showMap]);

  const prevWatchedOffset = useMemo(() => {
    if (watchedItemCount === 0) return 0;
    return 40 + watchedItemCount * 99;
  }, [watchedItemCount]);

  const handleMarkWatched = useCallback(
    async (item: EnrichedTrackingItem) => {
      if (!userId) return;
      const card = item as any as CardItem;

      if (item.mediaType === MediaType.MOVIE) {
        setUpdatingShows((prev) =>
          new Map(prev).set(item.tmdbId, MediaType.MOVIE),
        );
        await markMovieWatched(userId, item.tmdbId, card.nextEpisodeRuntime ?? 0);
        queryClient.invalidateQueries({ queryKey: [QueryKey.WATCHED_MOVIES, userId] });
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

      // Fire Firestore write — don't await, let UI update first
      markEpisodeWatched(
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
      ).then(() => {
        queryClient.invalidateQueries({
          queryKey: [QueryKey.WATCHED_EPISODES, userId],
        });
      }).catch((err) => {
        rollbackUpcoming(upcomingSnapshot);
        console.error("markEpisodeWatched failed:", err);
      });
    },
    [userId, queryClient, mutateCachedUpcoming, rollbackUpcoming],
  );

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
          if (item.status === "completed") next.delete(tmdbId);
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
      await stopWatching(userId, item.tmdbId, item.status);
      removeItem(item.tmdbId);
    },
    [userId, removeItem],
  );

  return {
    removeItem,
    listData,
    loading: effectiveLoading,
    loadMoreTracking,
    loadingMoreTracking,
    loadMoreEps,
    loadingMoreEps,
    hasMoreEps,
    prevWatchedOffset,
    watchedCountByShow,
    updatingShows,
    handleMarkWatched,
    handleStopWatching,
  };
}
