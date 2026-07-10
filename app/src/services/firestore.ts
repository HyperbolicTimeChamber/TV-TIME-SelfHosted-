import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  increment,
} from "@react-native-firebase/firestore";
import { WatchStatus, MediaType } from "../types";

const db = getFirestore();

function userRef(userId: string) {
  return doc(db, "users", userId);
}

function watchlistRef(userId: string) {
  return collection(doc(db, "users", userId), "watchlist");
}

function watchedEpisodesRef(userId: string) {
  return collection(doc(db, "users", userId), "watchedEpisodes");
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
  firstEpisode?: { season: number; episode: number },
  totalEpisodes?: number
) {
  const batch = writeBatch(db);
  batch.set(doc(watchlistRef(userId), String(tmdbId)), {
    tmdbId,
    mediaType,
    title,
    posterPath,
    addedAt: serverTimestamp(),
    lastWatchedAt: null,
    status: "watching" as WatchStatus,
    nextEpisode: firstEpisode || (mediaType === "tv" ? { season: 1, episode: 1 } : null),
    rewatchCount: 0,
    totalEpisodes: totalEpisodes ?? null,
  });
  batch.update(userRef(userId), {
    "stats.showsTracking": increment(1),
  });
  await batch.commit();
}

export async function removeFromWatchlist(userId: string, tmdbId: number) {
  const batch = writeBatch(db);
  batch.delete(doc(watchlistRef(userId), String(tmdbId)));
  batch.update(userRef(userId), {
    "stats.showsTracking": increment(-1),
  });
  await batch.commit();
}

export async function stopWatching(userId: string, tmdbId: number, currentStatus: WatchStatus) {
  if (currentStatus === "rewatching") {
    await updateDoc(doc(watchlistRef(userId), String(tmdbId)), {
      status: "paused_rewatch" as WatchStatus,
    });
  } else {
    await updateDoc(doc(watchlistRef(userId), String(tmdbId)), {
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
  const epRef = doc(watchedEpisodesRef(userId), docId);
  const epDoc = await getDoc(epRef);

  const batch = writeBatch(db);

  if (epDoc.exists()) {
    batch.update(epRef, {
      watchCount: increment(1),
      lastWatchedAt: serverTimestamp(),
    });
  } else {
    batch.set(epRef, {
      tmdbShowId,
      season,
      episode,
      episodeTitle,
      watchedAt: serverTimestamp(),
      lastWatchedAt: serverTimestamp(),
      runtime,
      watchCount: 1,
    });
  }

  batch.update(userRef(userId), {
    "stats.episodesWatched": increment(1),
    "stats.totalMinutes": increment(runtime),
  });

  const watchlistUpdate: Record<string, unknown> = {
    lastWatchedAt: serverTimestamp(),
    nextEpisode,
  };
  if (isShowComplete) {
    watchlistUpdate.status = "completed";
  }
  batch.update(doc(watchlistRef(userId), String(tmdbShowId)), watchlistUpdate);

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
  const epRef = doc(watchedEpisodesRef(userId), docId);

  const batch = writeBatch(db);
  batch.delete(epRef);
  batch.update(userRef(userId), {
    "stats.episodesWatched": increment(-1),
    "stats.totalMinutes": increment(-runtime),
  });
  await batch.commit();
}

export async function startRewatch(userId: string, tmdbId: number) {
  await updateDoc(doc(watchlistRef(userId), String(tmdbId)), {
    status: "rewatching" as WatchStatus,
    rewatchCount: increment(1),
    nextEpisode: { season: 1, episode: 1 },
    lastWatchedAt: serverTimestamp(),
  });
}

export async function resumeRewatch(userId: string, tmdbId: number) {
  await updateDoc(doc(watchlistRef(userId), String(tmdbId)), {
    status: "rewatching" as WatchStatus,
  });
}

// Episode schedule cache
function episodeCacheRef(userId: string) {
  return collection(doc(db, "users", userId), "episodeCache");
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
  const snap = await getDoc(doc(episodeCacheRef(userId), cacheDocId(tmdbId, seasonNum)));
  if (!snap.exists()) return null;
  const data = snap.data() as CachedSeason;
  if (Date.now() - data.cachedAt > CACHE_TTL) return null;
  return data;
}

export async function setCachedSeason(
  userId: string,
  tmdbId: number,
  seasonNum: number,
  episodes: CachedEpisode[]
): Promise<void> {
  await setDoc(doc(episodeCacheRef(userId), cacheDocId(tmdbId, seasonNum)), {
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
  const batch = writeBatch(db);
  batch.update(doc(watchlistRef(userId), String(tmdbId)), {
    status: "completed" as WatchStatus,
    lastWatchedAt: serverTimestamp(),
    nextEpisode: null,
  });
  batch.update(userRef(userId), {
    "stats.episodesWatched": increment(1),
    "stats.totalMinutes": increment(runtime),
  });
  await batch.commit();
}

export { db, watchlistRef, watchedEpisodesRef, userRef };
