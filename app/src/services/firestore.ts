import firestore from "@react-native-firebase/firestore";
import { WatchStatus, MediaType } from "../types";

const db = firestore();

function userRef(userId: string) {
  return db.collection("users").doc(userId);
}

function watchlistRef(userId: string) {
  return userRef(userId).collection("watchlist");
}

function watchedEpisodesRef(userId: string) {
  return userRef(userId).collection("watchedEpisodes");
}

function episodeDocId(tmdbShowId: number, season: number, episode: number) {
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  return `${tmdbShowId}_S${s}E${e}`;
}

export async function addToWatchlist(
  userId: string,
  tmdbId: number,
  mediaType: MediaType,
  title: string,
  posterPath: string,
  firstEpisode?: { season: number; episode: number }
) {
  const batch = db.batch();
  batch.set(watchlistRef(userId).doc(String(tmdbId)), {
    tmdbId,
    mediaType,
    title,
    posterPath,
    addedAt: firestore.FieldValue.serverTimestamp(),
    lastWatchedAt: null,
    status: "watching" as WatchStatus,
    nextEpisode: firstEpisode || (mediaType === "tv" ? { season: 1, episode: 1 } : null),
    rewatchCount: 0,
  });
  batch.update(userRef(userId), {
    "stats.showsTracking": firestore.FieldValue.increment(1),
  });
  await batch.commit();
}

export async function removeFromWatchlist(userId: string, tmdbId: number) {
  const batch = db.batch();
  batch.delete(watchlistRef(userId).doc(String(tmdbId)));
  batch.update(userRef(userId), {
    "stats.showsTracking": firestore.FieldValue.increment(-1),
  });
  await batch.commit();
}

export async function stopWatching(userId: string, tmdbId: number, currentStatus: WatchStatus) {
  if (currentStatus === "rewatching") {
    await watchlistRef(userId).doc(String(tmdbId)).update({
      status: "paused_rewatch" as WatchStatus,
    });
  } else {
    await watchlistRef(userId).doc(String(tmdbId)).update({
      status: "completed" as WatchStatus,
    });
  }
}

export async function markEpisodeWatched(
  userId: string,
  tmdbShowId: number,
  season: number,
  episode: number,
  episodeTitle: string,
  runtime: number,
  nextEpisode: { season: number; episode: number } | null,
  isShowComplete: boolean
) {
  const docId = episodeDocId(tmdbShowId, season, episode);
  const epRef = watchedEpisodesRef(userId).doc(docId);
  const epDoc = await epRef.get();

  const batch = db.batch();

  if (epDoc.exists()) {
    batch.update(epRef, {
      watchCount: firestore.FieldValue.increment(1),
      lastWatchedAt: firestore.FieldValue.serverTimestamp(),
    });
  } else {
    batch.set(epRef, {
      tmdbShowId,
      season,
      episode,
      episodeTitle,
      watchedAt: firestore.FieldValue.serverTimestamp(),
      lastWatchedAt: firestore.FieldValue.serverTimestamp(),
      runtime,
      watchCount: 1,
    });
  }

  batch.update(userRef(userId), {
    "stats.episodesWatched": firestore.FieldValue.increment(1),
    "stats.totalMinutes": firestore.FieldValue.increment(runtime),
  });

  const watchlistUpdate: Record<string, unknown> = {
    lastWatchedAt: firestore.FieldValue.serverTimestamp(),
    nextEpisode,
  };
  if (isShowComplete) {
    watchlistUpdate.status = "completed";
  }
  batch.update(watchlistRef(userId).doc(String(tmdbShowId)), watchlistUpdate);

  await batch.commit();
}

export async function unmarkEpisodeWatched(
  userId: string,
  tmdbShowId: number,
  season: number,
  episode: number,
  runtime: number
) {
  const docId = episodeDocId(tmdbShowId, season, episode);
  const epRef = watchedEpisodesRef(userId).doc(docId);

  const batch = db.batch();
  batch.delete(epRef);
  batch.update(userRef(userId), {
    "stats.episodesWatched": firestore.FieldValue.increment(-1),
    "stats.totalMinutes": firestore.FieldValue.increment(-runtime),
  });
  await batch.commit();
}

export async function startRewatch(userId: string, tmdbId: number) {
  await watchlistRef(userId)
    .doc(String(tmdbId))
    .update({
      status: "rewatching" as WatchStatus,
      rewatchCount: firestore.FieldValue.increment(1),
      nextEpisode: { season: 1, episode: 1 },
      lastWatchedAt: firestore.FieldValue.serverTimestamp(),
    });
}

export async function resumeRewatch(userId: string, tmdbId: number) {
  await watchlistRef(userId).doc(String(tmdbId)).update({
    status: "rewatching" as WatchStatus,
  });
}

// Episode schedule cache
function episodeCacheRef(userId: string) {
  return userRef(userId).collection("episodeCache");
}

function cacheDocId(tmdbId: number, seasonNum: number) {
  return `${tmdbId}_S${String(seasonNum).padStart(2, "0")}`;
}

export interface CachedEpisode {
  tmdbShowId: number;
  showTitle: string;
  posterPath: string | null;
  season: number;
  episode: number;
  episodeTitle: string;
  airDate: string;
  runtime: number | null;
}

export interface CachedSeason {
  tmdbId: number;
  seasonNum: number;
  episodes: CachedEpisode[];
  cachedAt: number; // timestamp ms
}

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function getCachedSeason(
  userId: string,
  tmdbId: number,
  seasonNum: number
): Promise<CachedSeason | null> {
  const doc = await episodeCacheRef(userId).doc(cacheDocId(tmdbId, seasonNum)).get();
  if (!doc.exists()) return null;
  const data = doc.data() as CachedSeason;
  if (Date.now() - data.cachedAt > CACHE_TTL) return null;
  return data;
}

export async function setCachedSeason(
  userId: string,
  tmdbId: number,
  seasonNum: number,
  episodes: CachedEpisode[]
): Promise<void> {
  await episodeCacheRef(userId).doc(cacheDocId(tmdbId, seasonNum)).set({
    tmdbId,
    seasonNum,
    episodes,
    cachedAt: Date.now(),
  });
}

export async function markMovieWatched(
  userId: string,
  tmdbId: number,
  runtime: number
) {
  const batch = db.batch();
  batch.update(watchlistRef(userId).doc(String(tmdbId)), {
    status: "completed" as WatchStatus,
    lastWatchedAt: firestore.FieldValue.serverTimestamp(),
    nextEpisode: null,
  });
  batch.update(userRef(userId), {
    "stats.episodesWatched": firestore.FieldValue.increment(1),
    "stats.totalMinutes": firestore.FieldValue.increment(runtime),
  });
  await batch.commit();
}

export { db, watchlistRef, watchedEpisodesRef, userRef };
