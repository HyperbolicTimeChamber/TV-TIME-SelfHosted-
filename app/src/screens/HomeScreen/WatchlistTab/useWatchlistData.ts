import { useMemo, useEffect, useCallback, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useWatchlist,
  EnrichedTrackingItem,
  useWatchedEpisodes,
  isShowVisible,
  sortByPriority,
} from "../../../hooks";
import {
  markEpisodeWatched,
  markMovieWatched,
  stopWatching,
  getCatalogShow,
} from "../../../services";
import { MediaType, CacheKey } from "../../../types";
import { ListItem } from "./types";

const ACTIVE_CACHE_LIMIT = 100;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

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
  const [updatingShows, setUpdatingShows] = useState<Map<number, string>>(
    new Map(),
  );
  const [cachedActive, setCachedActive] = useState<
    EnrichedTrackingItem[] | null
  >(null);
  const cacheRestored = useRef(false);

  // Restore cached active items on mount (invalidate if not from today)
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
          cached.items?.length > 0
        ) {
          setCachedActive(cached.items);
        }
      } catch {}
      cacheRestored.current = true;
    });
  }, [userId]);

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

  // Write cache when sortedActive updates from Firestore
  useEffect(() => {
    if (!userId || loading || sortedActive.length === 0) return;
    const toCache = sortedActive
      .slice(0, ACTIVE_CACHE_LIMIT)
      .map(({ catalogShow, ...rest }) => rest);
    AsyncStorage.setItem(
      CacheKey.WATCHLIST_ACTIVE,
      JSON.stringify({
        userId,
        date: todayStr(),
        items: toCache,
      }),
    ).catch(() => {});
    // Clear cached fallback once real data is in
    if (cachedActive) setCachedActive(null);
  }, [userId, loading, sortedActive]);

  // Use cached items while loading
  const effectiveActive = loading && cachedActive ? cachedActive : sortedActive;
  const effectiveLoading = loading && !cachedActive;

  // Auto-load more if too few visible items
  useEffect(() => {
    if (
      !loading &&
      hasMoreTracking &&
      !loadingMoreTracking &&
      sortedActive.length < 10 &&
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

  const listData: ListItem[] = useMemo(() => {
    const result: ListItem[] = [];
    if (sortedWatchedEps.length > 0) {
      result.push({ type: "sectionHeader", title: "Previously Watched" });
      for (const ep of sortedWatchedEps) {
        const show = showMap.get(ep.tmdbShowId);
        if (show) {
          result.push({ type: "watchedEpisode", episode: ep, show });
        }
      }
    }
    if (effectiveActive.length > 0) {
      result.push({ type: "sectionHeader", title: "What's Up Next" });
      for (const item of effectiveActive) {
        result.push({ type: "show", item });
      }
    }
    return result;
  }, [sortedWatchedEps, effectiveActive, showMap]);

  const prevWatchedOffset = useMemo(() => {
    if (watchedItemCount === 0) return 0;
    return 40 + watchedItemCount * 99;
  }, [watchedItemCount]);

  const handleMarkWatched = useCallback(
    async (item: EnrichedTrackingItem) => {
      if (!userId) return;

      if (item.mediaType === MediaType.MOVIE) {
        setUpdatingShows((prev) =>
          new Map(prev).set(item.tmdbId, MediaType.MOVIE),
        );
        const catalog = item.catalogShow ?? (await getCatalogShow(item.tmdbId));
        await markMovieWatched(userId, item.tmdbId, catalog?.runtime ?? 0);
        queryClient.invalidateQueries({ queryKey: ["watchedMovies", userId] });
        return;
      }

      const currentEp = item.nextEpisode ?? { season: 1, episode: 1 };
      const epKey = `${currentEp.season}-${currentEp.episode}`;
      setUpdatingShows((prev) => new Map(prev).set(item.tmdbId, epKey));

      const catalog = item.catalogShow ?? (await getCatalogShow(item.tmdbId));

      const catalogSeason = catalog?.seasons?.find(
        (s) => s.seasonNumber === currentEp.season,
      );
      const catalogEp = catalogSeason?.episodes?.find(
        (e) => e.episodeNumber === currentEp.episode,
      );
      const nextEpInSeason = catalogSeason?.episodes?.find(
        (e) => e.episodeNumber === currentEp.episode + 1,
      );

      let nextEpisode: { season: number; episode: number } | null = null;
      let nextEpisodeName: string | null = null;
      let isComplete = false;

      if (nextEpInSeason) {
        nextEpisode = {
          season: currentEp.season,
          episode: nextEpInSeason.episodeNumber,
        };
        nextEpisodeName = nextEpInSeason.title || null;
      } else {
        const nextCatalogSeason = catalog?.seasons?.find(
          (s) => s.seasonNumber === currentEp.season + 1,
        );
        if (nextCatalogSeason && nextCatalogSeason.episodes.length > 0) {
          nextEpisode = { season: currentEp.season + 1, episode: 1 };
          nextEpisodeName = nextCatalogSeason.episodes[0].title || null;
        } else {
          isComplete = true;
        }
      }

      // Get air date of next episode for priority scheduling
      let nextEpisodeAirDate: string | null = null;
      if (nextEpisode) {
        const nextSeason = catalog?.seasons?.find(
          (s) => s.seasonNumber === nextEpisode.season,
        );
        const nextEp = nextSeason?.episodes?.find(
          (e) => e.episodeNumber === nextEpisode.episode,
        );
        nextEpisodeAirDate = nextEp?.airDate ?? null;
      }

      await markEpisodeWatched(
        userId,
        item.tmdbId,
        currentEp.season,
        currentEp.episode,
        catalogEp?.title || "",
        catalogEp?.runtime || 0,
        nextEpisode,
        isComplete,
        false,
        nextEpisodeName,
        nextEpisodeAirDate,
      );
      queryClient.invalidateQueries({ queryKey: ["watchedEpisodes", userId] });
    },
    [userId, queryClient],
  );

  // Clear updating state when nextEpisode actually changes
  useEffect(() => {
    if (updatingShows.size === 0) return;
    setUpdatingShows((prev) => {
      const next = new Map(prev);
      for (const [tmdbId, markedEpKey] of prev) {
        const item = items.find((i) => i.tmdbId === tmdbId);
        if (!item) {
          next.delete(tmdbId);
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
