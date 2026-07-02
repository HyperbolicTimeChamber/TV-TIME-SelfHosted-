import { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";

export type WatchStatus =
  | "watching"
  | "plan_to_watch"
  | "completed"
  | "rewatching"
  | "paused_rewatch";

export type MediaType = "tv" | "movie";

export interface UserProfile {
  displayName: string;
  email: string;
  photoURL: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  stats: UserStats;
}

export interface UserStats {
  episodesWatched: number;
  showsTracking: number;
  totalMinutes: number;
}

export interface WatchlistItem {
  id: string; // Firestore doc ID = tmdbId as string
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterPath: string;
  addedAt: FirebaseFirestoreTypes.Timestamp;
  lastWatchedAt: FirebaseFirestoreTypes.Timestamp | null;
  status: WatchStatus;
  nextEpisode: { season: number; episode: number } | null;
  rewatchCount: number;
}

export interface WatchedEpisode {
  id: string; // Firestore doc ID = tmdbShowId_SxxExx
  tmdbShowId: number;
  season: number;
  episode: number;
  episodeTitle: string;
  watchedAt: FirebaseFirestoreTypes.Timestamp;
  lastWatchedAt: FirebaseFirestoreTypes.Timestamp;
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
