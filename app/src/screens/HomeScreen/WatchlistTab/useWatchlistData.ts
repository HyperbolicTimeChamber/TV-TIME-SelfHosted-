import { useMemo, useEffect, useCallback, useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useWatchlist,
  EnrichedTrackingItem,
  useWatchedEpisodes,
  isShowVisible,
  sortByPriority,
} from "../../../hooks";
import { markEpisodeWatched, markMovieWatched, stopWatching, getCatalogShow } from "../../../services";
import { MediaType } from "../../../types";
import { ListItem } from "./types";

export function useWatchlistData(userId: string | undefined) {
  const {
    items,
    loading,
    loadMore: loadMoreTracking,
    loadingMore: loadingMoreTracking,
    hasMore: hasMoreTracking,
  } = useWatchlist(userId);

  const {
    episodes: watchedEps,
    loadMore: loadMoreEps,
    loadingMore: loadingMoreEps,
    hasMore: hasMoreEps,
  } = useWatchedEpisodes(userId);

  const queryClient = useQueryClient();
  const [updatingShows, setUpdatingShows] = useState<Map<number, string>>(new Map());

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
  }, [loading, hasMoreTracking, loadingMoreTracking, sortedActive.length, items.length, loadMoreTracking]);

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
    if (sortedActive.length > 0) {
      result.push({ type: "sectionHeader", title: "Currently Watching" });
      for (const item of sortedActive) {
        result.push({ type: "show", item });
      }
    }
    return result;
  }, [sortedWatchedEps, sortedActive, showMap]);

  const prevWatchedOffset = useMemo(() => {
    if (watchedItemCount === 0) return 0;
    return 40 + watchedItemCount * 99;
  }, [watchedItemCount]);

  const handleMarkWatched = useCallback(
    async (item: EnrichedTrackingItem) => {
      if (!userId) return;

      if (item.mediaType === MediaType.MOVIE) {
        setUpdatingShows((prev) => new Map(prev).set(item.tmdbId, MediaType.MOVIE));
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
      let isComplete = false;

      if (nextEpInSeason) {
        nextEpisode = {
          season: currentEp.season,
          episode: nextEpInSeason.episodeNumber,
        };
      } else {
        const nextCatalogSeason = catalog?.seasons?.find(
          (s) => s.seasonNumber === currentEp.season + 1,
        );
        if (nextCatalogSeason && nextCatalogSeason.episodes.length > 0) {
          nextEpisode = { season: currentEp.season + 1, episode: 1 };
        } else {
          isComplete = true;
        }
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
    },
    [userId],
  );

  return {
    listData,
    loading,
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
