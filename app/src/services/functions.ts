import functions from "@react-native-firebase/functions";

const callable = functions();

export async function searchMulti(query: string, page: number = 1) {
  const result = await callable.httpsCallable("searchMulti")({ query, page });
  return result.data as {
    results: Array<Record<string, unknown>>;
    page: number;
    totalPages: number;
    totalResults: number;
  };
}

export async function getTrending(
  mediaType: string = "tv",
  timeWindow: string = "week"
) {
  const result = await callable.httpsCallable("getTrending")({
    mediaType,
    timeWindow,
  });
  return result.data as {
    results: Array<Record<string, unknown>>;
    page: number;
    totalPages: number;
  };
}

export async function getShowDetails(tmdbId: number, mediaType: string = "tv") {
  const result = await callable.httpsCallable("getShowDetails")({
    tmdbId,
    mediaType,
  });
  return result.data;
}

export async function getSeasonDetails(
  tmdbId: number,
  seasonNumber: number
) {
  const result = await callable.httpsCallable("getSeasonDetails")({
    tmdbId,
    seasonNumber,
  });
  return result.data;
}

export async function getUpcomingEpisodes(tmdbIds: number[]) {
  const result = await callable.httpsCallable("getUpcomingEpisodes")({
    tmdbIds,
  });
  return result.data as {
    episodes: Array<{
      tmdbShowId: number;
      showTitle: string;
      posterPath: string | null;
      season: number;
      episode: number;
      episodeTitle: string;
      airDate: string;
      runtime: number | null;
    }>;
  };
}
