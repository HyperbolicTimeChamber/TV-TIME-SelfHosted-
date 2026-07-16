import { Timestamp } from "@react-native-firebase/firestore";

export enum WatchStatus {
  WATCHING = "watching",
  PLAN_TO_WATCH = "plan_to_watch",
  COMPLETED = "completed",
  PAUSED = "paused",
  REWATCHING = "rewatching",
  PAUSED_REWATCH = "paused_rewatch",
}

export enum MediaType {
  TV = "tv",
  MOVIE = "movie",
}

// --- Catalog Types (shared show data from shows/ collection) ---

export interface CatalogEpisode {
  episodeNumber: number;
  title: string;
  airDate: string | null;
  runtime: number | null;
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

// --- Per-User Tracking (replaces WatchlistItem) ---

export interface TrackingItem {
  id: string; // Firestore doc ID = tmdbId
  tmdbId: number;
  mediaType: MediaType;
  status: WatchStatus;
  nextEpisode: { season: number; episode: number } | null;
  rewatchCount: number;
  addedAt: any; // Firestore Timestamp
  lastWatchedAt: any;
  priorityDate: any; // Firestore Timestamp — denormalized sort key
}

// Keep alias during transition
export type WatchlistItem = TrackingItem;

// --- Watched Movie ---

export interface WatchedMovie {
  id: string;
  tmdbId: number;
  watchCount: number;
  watchedAt: any;
  lastWatchedAt: any;
  runtime: number;
}

// --- User Profile ---

export interface UserProfile {
  displayName: string;
  email: string;
  photoURL: string;
  createdAt: any;
  stats: UserStats;
  hasCompletedImport: boolean;
  fcmToken?: string;
}

// --- User Stats ---

export interface UserStats {
  episodesWatched: number;
  showsTracking: number;
  moviesWatched: number;
  totalMinutes: number;
}

export interface WatchedEpisode {
  id: string; // Firestore doc ID = tmdbShowId_SxxExx
  tmdbShowId: number;
  season: number;
  episode: number;
  episodeTitle: string;
  watchedAt: Timestamp;
  lastWatchedAt: Timestamp;
  runtime: number;
  watchCount: number;
}

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
}

// Navigation param types
export type RootStackParamList = {
  Login: undefined;
  ImportData: undefined;
  Main: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Search: undefined;
  Calendar: undefined;
  Profile: undefined;
};

export type HomeTopTabParamList = {
  Watchlist: undefined;
  Upcoming: undefined;
};

export type HomeStackParamList = {
  HomeTabs: undefined;
  ShowDetail: { tmdbId: number; mediaType: MediaType };
  SeasonDetail: { tmdbId: number; seasonNumber: number; showTitle: string };
};

export type SearchStackParamList = {
  SearchMain: undefined;
  ShowDetail: { tmdbId: number; mediaType: MediaType };
};

export type CalendarStackParamList = {
  CalendarMain: undefined;
  ShowDetail: { tmdbId: number; mediaType: MediaType };
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  ImportData: undefined;
};
