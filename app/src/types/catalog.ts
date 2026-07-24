import { MediaType } from "../enums";

export interface CatalogEpisode {
  episodeNumber: number;
  title: string;
  overview: string;
  airDate: string | null;
  runtime: number | null;
  stillPath: string | null;
  isSeasonFinale?: boolean;
}

export interface CatalogSeason {
  seasonNumber: number;
  episodeCount: number;
  airDate: string | null;
  episodes: CatalogEpisode[];
}

export interface CatalogShow {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  status: string;
  totalSeasons: number;
  totalEpisodes: number;
  runtime: number | null;
  voteAverage: number;
  firstAirDate: string | null;
  releaseDate: string | null;
  seasons: CatalogSeason[];
  trackedBy: string[];
  trackedByCount: number;
  lastSyncedAt: any; // Firestore Timestamp
}
