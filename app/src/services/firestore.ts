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
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { WatchStatus, MediaType, CatalogShow } from "../types";

const db = getFirestore();

function userRef(userId: string) {
  return doc(db, "users", userId);
}

function trackingRef(userId: string) {
  return collection(doc(db, "users", userId), "tracking");
}

function watchedEpisodesRef(userId: string) {
  return collection(doc(db, "users", userId), "watchedEpisodes");
}

function watchedMoviesRef(userId: string) {
  return collection(doc(db, "users", userId), "watchedMovies");
}

function episodeDocId(tmdbShowId: number, season: number, episode: number) {
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  return `${tmdbShowId}_S${s}E${e}`;
}

// --- Catalog (shared show data) ---

export async function getCatalogShow(
  tmdbId: number
): Promise<CatalogShow | null> {
  const showDoc = await getDoc(doc(db, "shows", String(tmdbId)));
  if (!showDoc.exists()) return null;
  return { id: showDoc.id, ...showDoc.data() } as unknown as CatalogShow;
}

// --- Tracking CRUD ---

export async function addToTracking(
  userId: string,
  tmdbId: number,
  mediaType: MediaType
): Promise<void> {
  const functions = getFunctions();
  const now = serverTimestamp();

  // Call addShow CF (handles catalog population)
  await httpsCallable(functions, "addShow")({ tmdbId, mediaType });

  // Create local tracking doc
  const tRef = doc(trackingRef(userId), String(tmdbId));
  await setDoc(tRef, {
    tmdbId,
    mediaType,
    status: "watching" as WatchStatus,
    nextEpisode: mediaType === "tv" ? { season: 1, episode: 1 } : null,
    rewatchCount: 0,
    addedAt: now,
    lastWatchedAt: now,
    priorityDate: now,
  });

  // Update user stats
  const batch = writeBatch(db);
  batch.update(userRef(userId), {
    "stats.showsTracking": increment(1),
  });
  await batch.commit();
}

export async function removeFromTracking(
  userId: string,
  tmdbId: number
): Promise<void> {
  const functions = getFunctions();

  // Call removeShow CF (handles trackedBy + cleanup)
  await httpsCallable(functions, "removeShow")({ tmdbId });

  // Delete local tracking doc + update stats
  const batch = writeBatch(db);
  batch.delete(doc(trackingRef(userId), String(tmdbId)));
  batch.update(userRef(userId), {
    "stats.showsTracking": increment(-1),
  });
  await batch.commit();
}

export async function stopWatching(userId: string, tmdbId: number, currentStatus: WatchStatus) {
  if (currentStatus === "rewatching") {
    await updateDoc(doc(trackingRef(userId), String(tmdbId)), {
      status: "paused_rewatch" as WatchStatus,
    });
  } else {
    await updateDoc(doc(trackingRef(userId), String(tmdbId)), {
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

  const trackingUpdate: Record<string, unknown> = {
    lastWatchedAt: serverTimestamp(),
    priorityDate: serverTimestamp(),
    nextEpisode,
  };
  if (isShowComplete) {
    trackingUpdate.status = "completed";
  }
  batch.update(doc(trackingRef(userId), String(tmdbShowId)), trackingUpdate);

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
  await updateDoc(doc(trackingRef(userId), String(tmdbId)), {
    status: "rewatching" as WatchStatus,
    rewatchCount: increment(1),
    nextEpisode: { season: 1, episode: 1 },
    lastWatchedAt: serverTimestamp(),
    priorityDate: serverTimestamp(),
  });
}

export async function resumeRewatch(userId: string, tmdbId: number) {
  await updateDoc(doc(trackingRef(userId), String(tmdbId)), {
    status: "rewatching" as WatchStatus,
  });
}

export async function markMovieWatched(
  userId: string,
  tmdbId: number,
  runtime: number
): Promise<void> {
  const batch = writeBatch(db);
  const movieRef = doc(watchedMoviesRef(userId), String(tmdbId));
  const tRef = doc(trackingRef(userId), String(tmdbId));
  const now = serverTimestamp();

  // Check if already watched (for rewatch)
  const movieDoc = await getDoc(movieRef);
  if (movieDoc.exists()) {
    batch.update(movieRef, {
      watchCount: increment(1),
      lastWatchedAt: now,
    });
  } else {
    batch.set(movieRef, {
      tmdbId,
      watchCount: 1,
      watchedAt: now,
      lastWatchedAt: now,
      runtime: runtime || 0,
    });
  }

  batch.update(tRef, {
    status: "completed",
    lastWatchedAt: now,
    priorityDate: now,
  });

  batch.update(userRef(userId), {
    "stats.moviesWatched": increment(1),
    "stats.totalMinutes": increment(Math.round(runtime / 60)),
  });

  await batch.commit();
}

// Keep backward-compatible aliases during transition
/** @deprecated Use addToTracking */
export const addToWatchlist = addToTracking as any;
/** @deprecated Use removeFromTracking */
export const removeFromWatchlist = removeFromTracking as any;

export { db, trackingRef, trackingRef as watchlistRef, watchedEpisodesRef, watchedMoviesRef, userRef };
