import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getShowDetails, getSeasonEpisodes, pooled, ShowSeasonInfo } from "../services/tmdb";
import { useAuthStore } from "../stores/authStore";
import { UpcomingEpisode, WatchlistItem, TMDBShow } from "../types";

export function useCalendarEpisodes(tvShows: WatchlistItem[]) {
  const apiKey = useAuthStore((s) => s.tmdbApiKey)!;
  const userId = useAuthStore((s) => s.user?.uid);
  const [episodesByKey, setEpisodesByKey] = useState<Map<string, UpcomingEpisode[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const loadedKeys = useRef(new Set<string>());

  const tmdbIds = useMemo(() => tvShows.map((s) => s.tmdbId), [tvShows]);

  // Fetch show details for all shows to get season air_dates
  const { data: showDetails } = useQuery({
    queryKey: ["calendarShows", tmdbIds],
    queryFn: async () => {
      const tasks = tmdbIds.map((id) => async () => {
        try {
          return await getShowDetails(apiKey, id, "tv");
        } catch {
          return null;
        }
      });
      const results = await pooled(tasks, 5);
      return results.filter((s): s is TMDBShow => s !== null);
    },
    staleTime: 24 * 60 * 60 * 1000,
    enabled: tmdbIds.length > 0,
  });

  const allEpisodes = useMemo(() => {
    const all: UpcomingEpisode[] = [];
    for (const eps of episodesByKey.values()) {
      all.push(...eps);
    }
    return all;
  }, [episodesByKey]);

  const loadMonthEpisodes = useCallback(
    async (year: number, _month: number) => {
      if (!showDetails || loading) return;

      const tasks: (() => Promise<UpcomingEpisode[]>)[] = [];
      const taskKeys: string[] = [];

      for (const show of showDetails) {
        if (!show.seasons) continue;

        for (const season of show.seasons) {
          if (season.season_number === 0) continue;
          if (!season.air_date) continue;

          const seasonYear = parseInt(season.air_date.substring(0, 4), 10);
          // Load if season aired in viewed year or year before (episodes can span into next year)
          if (seasonYear === year || seasonYear === year - 1) {
            const key = `${show.id}_${season.season_number}`;
            if (loadedKeys.current.has(key)) continue;
            loadedKeys.current.add(key);

            const info: ShowSeasonInfo = {
              tmdbId: show.id,
              showTitle: show.name || show.title || "",
              posterPath: show.poster_path,
              currentSeason: season.season_number,
              totalSeasons: show.number_of_seasons ?? 1,
            };
            tasks.push(() => getSeasonEpisodes(apiKey, info, season.season_number, userId));
            taskKeys.push(key);
          }
        }
      }

      if (tasks.length === 0) return;

      setLoading(true);
      try {
        const results = await pooled(tasks, 5);
        setEpisodesByKey((prev) => {
          const next = new Map(prev);
          for (let i = 0; i < taskKeys.length; i++) {
            next.set(taskKeys[i], results[i]);
          }
          return next;
        });
      } finally {
        setLoading(false);
      }
    },
    [showDetails, apiKey, userId, loading]
  );

  return {
    episodes: allEpisodes,
    loading,
    loadMonthEpisodes,
  };
}
