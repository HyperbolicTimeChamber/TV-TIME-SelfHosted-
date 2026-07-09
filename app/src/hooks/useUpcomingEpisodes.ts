import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSeasonEpisodes, getShowSeasonInfos, ShowSeasonInfo, pooled } from "../services/tmdb";
import { useAuthStore } from "../stores/authStore";
import { UpcomingEpisode, WatchlistItem } from "../types";

export function useUpcomingEpisodes(tvShows: WatchlistItem[]) {
  const apiKey = useAuthStore((s) => s.tmdbApiKey)!;
  const userId = useAuthStore((s) => s.user?.uid);
  const [extraEpisodes, setExtraEpisodes] = useState<UpcomingEpisode[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const loadedSeasons = useRef(new Map<string, boolean>());

  const tmdbIds = useMemo(() => tvShows.map((s) => s.tmdbId), [tvShows]);

  // Build a map of user's current season per show
  const userSeasonMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const show of tvShows) {
      const season = show.nextEpisode?.season ?? 1;
      map.set(show.tmdbId, season);
    }
    return map;
  }, [tvShows]);

  const { data, isLoading } = useQuery({
    queryKey: ["upcoming", tmdbIds],
    queryFn: async () => {
      const infos = await getShowSeasonInfos(apiKey, tmdbIds);
      // Override currentSeason with user's progress
      const adjustedInfos = infos.map((info) => ({
        ...info,
        currentSeason: userSeasonMap.get(info.tmdbId) ?? info.currentSeason,
      }));
      const seasonTasks = adjustedInfos.map(
        (info) => () => getSeasonEpisodes(apiKey, info, info.currentSeason, userId)
      );
      const results = await pooled(seasonTasks, 5);
      return { episodes: results.flat(), showInfos: adjustedInfos };
    },
    staleTime: 60 * 60 * 1000,
    enabled: tmdbIds.length > 0,
  });

  // Reset extra episodes when base data changes
  useEffect(() => {
    setExtraEpisodes([]);
    loadedSeasons.current.clear();
  }, [tmdbIds.join(",")]);

  const showInfos = data?.showInfos ?? [];

  const allEpisodes = useMemo(() => {
    const base = data?.episodes ?? [];
    const all = [...base, ...extraEpisodes];
    return all.sort((a, b) => a.airDate.localeCompare(b.airDate));
  }, [data?.episodes, extraEpisodes]);

  const loadOlderEpisodes = useCallback(async () => {
    if (loadingOlder || showInfos.length === 0) return;
    setLoadingOlder(true);
    try {
      const tasks: (() => Promise<UpcomingEpisode[]>)[] = [];
      for (const info of showInfos) {
        const showEps = allEpisodes.filter((e) => e.tmdbShowId === info.tmdbId);
        const minSeason = showEps.length > 0
          ? Math.min(...showEps.map((e) => e.season))
          : info.currentSeason;
        const prevSeason = minSeason - 1;
        if (prevSeason < 1) continue;
        const key = `${info.tmdbId}_${prevSeason}`;
        if (loadedSeasons.current.has(key)) continue;
        loadedSeasons.current.set(key, true);
        tasks.push(() => getSeasonEpisodes(apiKey, info, prevSeason, userId));
      }
      if (tasks.length === 0) return;
      const results = await pooled(tasks, 5);
      const newEps = results.flat();
      if (newEps.length > 0) {
        setExtraEpisodes((prev) => [...newEps, ...prev]);
      }
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, showInfos, allEpisodes, apiKey]);

  const loadNewerEpisodes = useCallback(async () => {
    if (loadingNewer || showInfos.length === 0) return;
    setLoadingNewer(true);
    try {
      const tasks: (() => Promise<UpcomingEpisode[]>)[] = [];
      for (const info of showInfos) {
        const showEps = allEpisodes.filter((e) => e.tmdbShowId === info.tmdbId);
        const maxSeason = showEps.length > 0
          ? Math.max(...showEps.map((e) => e.season))
          : info.currentSeason;
        const nextSeason = maxSeason + 1;
        if (nextSeason > info.totalSeasons) continue;
        const key = `${info.tmdbId}_${nextSeason}`;
        if (loadedSeasons.current.has(key)) continue;
        loadedSeasons.current.set(key, true);
        tasks.push(() => getSeasonEpisodes(apiKey, info, nextSeason, userId));
      }
      if (tasks.length === 0) return;
      const results = await pooled(tasks, 5);
      const newEps = results.flat();
      if (newEps.length > 0) {
        setExtraEpisodes((prev) => [...prev, ...newEps]);
      }
    } finally {
      setLoadingNewer(false);
    }
  }, [loadingNewer, showInfos, allEpisodes, apiKey]);

  return {
    data: allEpisodes,
    isLoading,
    loadOlderEpisodes,
    loadNewerEpisodes,
    loadingOlder,
    loadingNewer,
  };
}
