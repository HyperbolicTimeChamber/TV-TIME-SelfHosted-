import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getUpcomingEpisodes, getSeasonEpisodes, ShowSeasonInfo } from "../services/tmdb";
import { useAuthStore } from "../stores/authStore";
import { UpcomingEpisode } from "../types";

export function useUpcomingEpisodes(tmdbIds: number[]) {
  const apiKey = useAuthStore((s) => s.tmdbApiKey)!;
  const [extraEpisodes, setExtraEpisodes] = useState<UpcomingEpisode[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const loadedSeasons = useRef(new Map<string, boolean>());

  const { data, isLoading } = useQuery({
    queryKey: ["upcoming", tmdbIds],
    queryFn: () => getUpcomingEpisodes(apiKey, tmdbIds),
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
      const fetches = showInfos.map(async (info) => {
        // Find earliest loaded season for this show
        const showEps = allEpisodes.filter((e) => e.tmdbShowId === info.tmdbId);
        const minSeason = showEps.length > 0
          ? Math.min(...showEps.map((e) => e.season))
          : info.currentSeason;
        const prevSeason = minSeason - 1;
        if (prevSeason < 1) return [];
        const key = `${info.tmdbId}_${prevSeason}`;
        if (loadedSeasons.current.has(key)) return [];
        loadedSeasons.current.set(key, true);
        return getSeasonEpisodes(apiKey, info, prevSeason);
      });
      const results = await Promise.all(fetches);
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
      const fetches = showInfos.map(async (info) => {
        const showEps = allEpisodes.filter((e) => e.tmdbShowId === info.tmdbId);
        const maxSeason = showEps.length > 0
          ? Math.max(...showEps.map((e) => e.season))
          : info.currentSeason;
        const nextSeason = maxSeason + 1;
        if (nextSeason > info.totalSeasons) return [];
        const key = `${info.tmdbId}_${nextSeason}`;
        if (loadedSeasons.current.has(key)) return [];
        loadedSeasons.current.set(key, true);
        return getSeasonEpisodes(apiKey, info, nextSeason);
      });
      const results = await Promise.all(fetches);
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
