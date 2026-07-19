import { Timestamp } from "@react-native-firebase/firestore";
import { MediaType, WatchStatus } from "../enums";

export interface TrackingItem {
  id: string; // Firestore doc ID = tmdbId
  tmdbId: number;
  mediaType: MediaType;
  status: WatchStatus;
  nextEpisode: { season: number; episode: number } | null;
  nextEpisodeName: string | null;
  rewatchCount: number;
  addedAt: any; // Firestore Timestamp
  lastWatchedAt: any;
  priorityDate: any; // Firestore Timestamp — denormalized sort key
  releaseDate?: string | null; // ISO date for movies
}

export type WatchlistItem = TrackingItem;

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

export interface WatchedMovie {
  id: string;
  tmdbId: number;
  watchCount: number;
  watchedAt: any;
  lastWatchedAt: any;
  runtime: number;
}

export interface UserStats {
  episodesWatched: number;
  showsTracking: number;
  moviesWatched: number;
  totalMinutes: number;
}

export interface UserProfile {
  displayName: string;
  email: string;
  photoURL: string;
  createdAt: any;
  stats: UserStats;
  hasCompletedImport: boolean;
  fcmToken?: string;
}
