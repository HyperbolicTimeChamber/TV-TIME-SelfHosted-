import { MediaType } from "../enums";

export interface TMDBShow {
  id: number;
  name?: string; // TV shows
  title?: string; // Movies
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  first_air_date?: string;
  release_date?: string;
  media_type?: MediaType;
  genre_ids: number[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  runtime?: number;
  seasons?: TMDBSeason[];
}

export interface TMDBSeason {
  id: number;
  season_number: number;
  name: string;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
}

export interface TMDBEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  runtime: number | null;
  still_path: string | null;
}

export interface UpcomingEpisode {
  tmdbShowId: number;
  showTitle: string;
  posterPath: string | null;
  season: number;
  episode: number;
  episodeTitle: string;
  airDate: string;
  runtime: number | null;
  mediaType?: MediaType;
}
