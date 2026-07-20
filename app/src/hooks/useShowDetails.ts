import { useQuery } from "@tanstack/react-query";
import { getShowDetails, getCatalogShow } from "../services";
import { useAuthStore } from "../stores";
import { TMDBShow, TMDBEpisode, CatalogShow, QueryKey } from "../types";

export interface ShowDetailsResult {
  show: TMDBShow;
  episodesBySeason: Map<number, TMDBEpisode[]>;
}

function catalogShowToResult(catalog: CatalogShow): ShowDetailsResult {
  const episodesBySeason = new Map<number, TMDBEpisode[]>();

  const show: TMDBShow = {
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

  for (const s of catalog.seasons) {
    episodesBySeason.set(
      s.seasonNumber,
      s.episodes.map((ep) => ({
        id: 0,
        episode_number: ep.episodeNumber,
        season_number: s.seasonNumber,
        name: ep.title,
        overview: ep.overview ?? "",
        air_date: ep.airDate,
        runtime: ep.runtime,
        still_path: ep.stillPath ?? null,
      })),
    );
  }

  return { show, episodesBySeason };
}

export function useShowDetails(tmdbId: number, mediaType: string = "tv") {
  const result = useQuery({
    queryKey: [QueryKey.SHOW, tmdbId, mediaType],
    queryFn: async (): Promise<ShowDetailsResult> => {
      // Try catalog first
      const catalogShow = await getCatalogShow(tmdbId, mediaType as "tv" | "movie");
      if (catalogShow) return catalogShowToResult(catalogShow);

      // Fallback to TMDB
      const apiKey = useAuthStore.getState().appTmdbApiKey;
      if (!apiKey) throw new Error("No TMDB API key available");
      const show = await getShowDetails(apiKey, tmdbId, mediaType);
      return { show, episodesBySeason: new Map() };
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  return {
    ...result,
    data: result.data?.show as TMDBShow | undefined,
    episodesBySeason:
      result.data?.episodesBySeason ?? new Map<number, TMDBEpisode[]>(),
  };
}
