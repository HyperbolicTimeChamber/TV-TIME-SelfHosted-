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
  await watchlistRef(userId)
    .doc(String(tmdbId))
    .set({
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
}

export async function removeFromWatchlist(userId: string, tmdbId: number) {
  await watchlistRef(userId).doc(String(tmdbId)).delete();
}

export async function stopWatching(userId: string, tmdbId: number, currentStatus: WatchStatus) {
  if (currentStatus === "rewatching") {
    await watchlistRef(userId).doc(String(tmdbId)).update({
      status: "paused_rewatch" as WatchStatus,
    });
  } else {
    await removeFromWatchlist(userId, tmdbId);
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

  if (epDoc.exists()) {
    await epRef.update({
      watchCount: firestore.FieldValue.increment(1),
      lastWatchedAt: firestore.FieldValue.serverTimestamp(),
    });
  } else {
    await epRef.set({
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

  const watchlistUpdate: Record<string, unknown> = {
    lastWatchedAt: firestore.FieldValue.serverTimestamp(),
    nextEpisode,
  };
  if (isShowComplete) {
    watchlistUpdate.status = "completed";
  }
  await watchlistRef(userId).doc(String(tmdbShowId)).update(watchlistUpdate);
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

export { db, watchlistRef, watchedEpisodesRef, userRef };
