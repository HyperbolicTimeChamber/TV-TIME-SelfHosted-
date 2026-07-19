// firestore
export {
  getCatalogShow,
  getHighestWatchedEpisode,
  getCallableErrorMessage,
  addToTracking,
  removeFromTracking,
  stopWatching,
  markEpisodeWatched,
  unmarkEpisodeWatched,
  decrementEpisodeWatchCount,
  unmarkSeasonWatched,
  decrementSeasonWatchCount,
  startRewatch,
  resumeWatching,
  resumeRewatch,
  markMovieWatched,
  markSeasonWatchedCF,
  addToWatchlist,
  removeFromWatchlist,
  db,
  trackingRef,
  watchlistRef,
  watchedEpisodesRef,
  watchedMoviesRef,
  userRef,
  onAddTrackingError,
} from "./firestore";

// tmdb
export {
  searchMulti,
  getTrending,
  getShowDetails,
  getSeasonDetails,
  discoverTVByAirDate,
  pooled,
} from "./tmdb";

// tvtimeImport
export type {
  ParsedShow,
  ParsedEpisode,
  ParsedMovie,
  ParsedGdprData,
  TMDBMatch,
  AmbiguousMatch,
  MatchResult,
  ImportStats,
} from "./tvtimeImport";
export {
  parseGdprZip,
  searchTMDBPage,
  matchShowsAndMovies,
} from "./tvtimeImport";
