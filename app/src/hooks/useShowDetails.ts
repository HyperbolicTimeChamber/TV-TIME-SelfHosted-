import { useQuery } from "@tanstack/react-query";
import { getShowDetails } from "../services/tmdb";
import { getCatalogShow } from "../services/firestore";
import { useAuthStore } from "../stores/authStore";
import { TMDBShow, CatalogShow } from "../types";

function catalogShowToTMDBShow(catalog: CatalogShow): TMDBShow {
  return {
    id: catalog.tmdbId,
    name: catalog.mediaType === "tv" ? catalog.title : undefined,
    title: catalog.mediaType === "movie" ? catalog.title : undefined,
    poster_path: catalog.posterPath,
    backdrop_path: catalog.backdropPath,
    overview: catalog.overview,
    vote_average: catalog.voteAverage,
    first_air_date: catalog.firstAirDate ?? undefined,
    release_date: catalog.releaseDate ?? undefined,
    media_type: catalog.mediaType,
    genre_ids: [],
    number_of_seasons: catalog.totalSeasons,
    number_of_episodes: catalog.totalEpisodes,
    status: catalog.status,
    runtime: catalog.runtime ?? undefined,
    seasons: catalog.seasons.map((s) => ({
      id: 0,
      season_number: s.seasonNumber,
      name: `Season ${s.seasonNumber}`,
      episode_count: s.episodeCount,
      air_date: s.airDate,
      poster_path: catalog.posterPath,
    })),
  };
}

export function useShowDetails(tmdbId: number, mediaType: string = "tv") {
  return useQuery({
    queryKey: ["show", tmdbId, mediaType],
    queryFn: async () => {
      // Try catalog first
      const catalogShow = await getCatalogShow(tmdbId);
      if (catalogShow) return catalogShowToTMDBShow(catalogShow);

      // Fallback to TMDB
      const apiKey = useAuthStore.getState().appTmdbApiKey;
      if (!apiKey) throw new Error("No TMDB API key available");
      return getShowDetails(apiKey, tmdbId, mediaType);
    },
    staleTime: 24 * 60 * 60 * 1000,
    select: (data) => data as unknown as TMDBShow,
  });
}
