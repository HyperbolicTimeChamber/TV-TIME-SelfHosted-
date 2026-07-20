import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  increment,
  Timestamp,
} from "@react-native-firebase/firestore";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { WatchStatus, MediaType, CatalogShow } from "../types";
import { showDocId } from "../utils/docId";

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
  tmdbId: number,
  mediaType: MediaType | "tv" | "movie" = MediaType.TV,
): Promise<CatalogShow | null> {
  const docId = showDocId(tmdbId, mediaType === MediaType.TV ? "tv" : "movie");
  const showDoc = await getDoc(doc(db, "shows", docId));
  if (!showDoc.exists()) return null;
  return { id: showDoc.id, ...showDoc.data() } as unknown as CatalogShow;
}

export async function getHighestWatchedEpisode(
  userId: string,
  tmdbShowId: number,
): Promise<{ season: number; episode: number } | null> {
  const epCol = watchedEpisodesRef(userId);
  // Query only episodes for this show instead of reading ALL episodes
  const snap = await getDocs(
    query(epCol, where("tmdbShowId", "==", tmdbShowId)),
  );
  let highest: { season: number; episode: number } | null = null;
  for (const d of snap.docs) {
    const data = d.data();
    if (
      !highest ||
      data.season > highest.season ||
      (data.season === highest.season && data.episode > highest.episode)
    ) {
      highest = { season: data.season, episode: data.episode };
    }
  }
  return highest;
}

// --- Error helpers ---

function getCallableErrorMessage(err: any): string {
  const code = err?.code;
  const msg = err?.message;
  if (code === "functions/not-found") return "Show not found on TMDB.";
  if (code === "functions/failed-precondition")
    return msg || "Service misconfigured.";
  if (code === "functions/unavailable")
    return "Could not reach TMDB. Try again later.";
  if (code === "functions/unauthenticated") return "You must be signed in.";
  if (code === "functions/invalid-argument") return msg || "Invalid request.";
  return msg || "Something went wrong. Try again.";
}

export { getCallableErrorMessage };

// --- Tracking CRUD ---

export async function addToTracking(
  userId: string,
  tmdbId: number,
  mediaType: MediaType,
  releaseDate?: string | null,
  meta?: { title?: string; posterPath?: string | null },
): Promise<void> {
  const docId = showDocId(tmdbId, mediaType === MediaType.TV ? "tv" : "movie");
  const showRef = doc(db, "shows", docId);
  const now = Timestamp.now();

  let priorityDate = now;
  if (mediaType === MediaType.MOVIE && releaseDate) {
    const releaseDateMs = new Date(releaseDate).getTime();
    if (releaseDateMs > now.toMillis()) {
      priorityDate = Timestamp.fromMillis(releaseDateMs);
    }
  }

  // Write tracking doc immediately — no catalog read needed
  const batch = writeBatch(db);
  batch.set(doc(trackingRef(userId), docId), {
    tmdbId,
    mediaType,
    status: WatchStatus.WATCHING,
    nextEpisode: mediaType === MediaType.TV ? { season: 1, episode: 1 } : null,
    nextEpisodeName: null, // Enriched by listener after CF populates catalog
    nextEpisodeAirDate: null,
    rewatchCount: 0,
    addedAt: now,
    lastWatchedAt: now,
    priorityDate,
    ...(mediaType === MediaType.MOVIE ? { releaseDate: releaseDate || null } : {}),
    ...(meta?.title ? { title: meta.title } : {}),
    ...(meta?.posterPath ? { posterPath: meta.posterPath } : {}),
  });
  batch.set(
    userRef(userId),
    { stats: { showsTracking: increment(1) } },
    { merge: true },
  );
  await batch.commit();

  // Background: ensure catalog exists + update trackedBy
  // If CF fails after retry → rollback tracking doc + call onError
  const tRef = doc(trackingRef(userId), docId);
  const callAddShow = () =>
    httpsCallable(getFunctions(), "addShow")({ tmdbId, mediaType });
  callAddShow().catch(() =>
    callAddShow().catch(async () => {
      // Both attempts failed — undo the local add
      const rollback = writeBatch(db);
      rollback.delete(tRef);
      rollback.set(
        userRef(userId),
        { stats: { showsTracking: increment(-1) } },
        { merge: true },
      );
      await rollback.commit().catch(() => {});
      // Emit error for UI to pick up
      addTrackingErrorListeners.forEach((fn) =>
        fn(tmdbId, meta?.title || `Show #${tmdbId}`),
      );
    }),
  );
}

// Error listeners for background CF failures
type AddTrackingErrorCallback = (tmdbId: number, title: string) => void;
const addTrackingErrorListeners = new Set<AddTrackingErrorCallback>();
export function onAddTrackingError(cb: AddTrackingErrorCallback): () => void {
  addTrackingErrorListeners.add(cb);
  return () => addTrackingErrorListeners.delete(cb);
}

export async function removeFromTracking(
  userId: string,
  tmdbId: number,
  mediaType: MediaType | "tv" | "movie",
): Promise<void> {
  // Delete tracking doc + decrement stats immediately
  const docId = showDocId(tmdbId, mediaType === MediaType.TV ? "tv" : "movie");
  const batch = writeBatch(db);
  batch.delete(doc(trackingRef(userId), docId));
  batch.set(
    userRef(userId),
    { stats: { showsTracking: increment(-1) } },
    { merge: true },
  );
  await batch.commit();

  // Background: update trackedBy on catalog doc (CF handles cleanup)
  httpsCallable(getFunctions(), "removeShow")({ tmdbId, mediaType }).catch(
    (err: any) => console.error("[removeFromTracking] removeShow CF failed:", err),
  );
}

export async function stopWatching(
  userId: string,
  tmdbId: number,
  currentStatus: WatchStatus,
  mediaType: MediaType | "tv" | "movie",
) {
  let newStatus: WatchStatus;
  if (currentStatus === WatchStatus.REWATCHING) {
    newStatus = WatchStatus.PAUSED_REWATCH;
  } else if (currentStatus === WatchStatus.WATCHING) {
    newStatus = WatchStatus.PAUSED;
  } else {
    newStatus = WatchStatus.COMPLETED;
  }
  const docId = showDocId(tmdbId, mediaType === MediaType.TV ? "tv" : "movie");
  await updateDoc(doc(trackingRef(userId), docId), {
    status: newStatus,
  });
}

export async function markEpisodeWatched(
  userId: string,
  tmdbShowId: number,
  season: number,
  episode: number,
  episodeTitle: string,
  runtime: number,
  nextEpisode: { season: number; episode: number } | null,
  isShowComplete: boolean,
  skipTrackingUpdate: boolean = false,
  nextEpisodeName: string | null = null,
  nextEpisodeAirDate: string | null = null,
) {
  const docId = episodeDocId(tmdbShowId, season, episode);
  const epRef = doc(watchedEpisodesRef(userId), docId);

  const batch = writeBatch(db);

  // No pre-read needed. increment(1) handles both create (0+1=1) and update.
  // watchedAt only matters for "first watched" — acceptable to update on rewatch.
  batch.set(
    epRef,
    {
      tmdbShowId,
      season,
      episode,
      episodeTitle,
      lastWatchedAt: serverTimestamp(),
      runtime,
      watchCount: increment(1),
    },
    { merge: true },
  );

  batch.set(
    userRef(userId),
    {
      stats: {
        episodesWatched: increment(1),
        totalMinutes: increment(runtime),
      },
    },
    { merge: true },
  );

  if (!skipTrackingUpdate) {
    const now = Timestamp.now();
    // If next episode hasn't aired yet, use its airDate as priorityDate
    // so it sorts to top when it becomes visible
    let effectivePriority: typeof now = now;
    if (nextEpisode && nextEpisodeAirDate) {
      const airDateMs = new Date(nextEpisodeAirDate).getTime();
      if (airDateMs > now.toMillis()) {
        effectivePriority = Timestamp.fromMillis(airDateMs);
      }
    }
    const trackingUpdate: Record<string, unknown> = {
      lastWatchedAt: now,
      priorityDate: effectivePriority,
      nextEpisode,
      nextEpisodeName,
      nextEpisodeAirDate: nextEpisodeAirDate ?? null,
    };
    if (isShowComplete) {
      trackingUpdate.status = WatchStatus.COMPLETED;
    }
    batch.update(doc(trackingRef(userId), showDocId(tmdbShowId, "tv")), trackingUpdate);
  }

  await batch.commit();
}

export async function unmarkEpisodeWatched(
  userId: string,
  tmdbShowId: number,
  season: number,
  episode: number,
  runtime: number,
  episodeName?: string | null,
  nextEpisodeAirDate?: string | null,
) {
  const docId = episodeDocId(tmdbShowId, season, episode);
  const epRef = doc(watchedEpisodesRef(userId), docId);

  const batch = writeBatch(db);
  batch.delete(epRef);
  batch.set(
    userRef(userId),
    {
      stats: {
        episodesWatched: increment(-1),
        totalMinutes: increment(-runtime),
      },
    },
    { merge: true },
  );
  // Update tracking to point to this now-unwatched episode
  batch.update(doc(trackingRef(userId), showDocId(tmdbShowId, "tv")), {
    nextEpisode: { season, episode },
    nextEpisodeName: episodeName || null,
    nextEpisodeAirDate: nextEpisodeAirDate || null,
    status: WatchStatus.WATCHING,
    priorityDate: Timestamp.now(),
  });
  await batch.commit();
}

export async function decrementEpisodeWatchCount(
  userId: string,
  tmdbShowId: number,
  season: number,
  episode: number,
  runtime: number,
  currentWatchCount: number,
  episodeName?: string | null,
  nextEpisodeAirDate?: string | null,
) {
  const docId = episodeDocId(tmdbShowId, season, episode);
  const epRef = doc(watchedEpisodesRef(userId), docId);
  const batch = writeBatch(db);

  const willDelete = currentWatchCount <= 1;
  if (willDelete) {
    batch.delete(epRef);
  } else {
    batch.update(epRef, {
      watchCount: increment(-1),
    });
  }

  batch.set(
    userRef(userId),
    {
      stats: {
        episodesWatched: increment(-1),
        totalMinutes: increment(-runtime),
      },
    },
    { merge: true },
  );

  // When fully unwatched, update tracking to point back to this episode
  if (willDelete) {
    batch.update(doc(trackingRef(userId), showDocId(tmdbShowId, "tv")), {
      nextEpisode: { season, episode },
      nextEpisodeName: episodeName || null,
      nextEpisodeAirDate: nextEpisodeAirDate || null,
      status: WatchStatus.WATCHING,
      priorityDate: Timestamp.now(),
    });
  }

  await batch.commit();
}

export async function unmarkSeasonWatched(
  userId: string,
  tmdbShowId: number,
  episodes: Array<{ season: number; episode: number; runtime: number }>,
) {
  const batch = writeBatch(db);
  let totalRuntime = 0;

  for (const ep of episodes) {
    const docId = episodeDocId(tmdbShowId, ep.season, ep.episode);
    batch.delete(doc(watchedEpisodesRef(userId), docId));
    totalRuntime += ep.runtime;
  }

  batch.set(
    userRef(userId),
    {
      stats: {
        episodesWatched: increment(-episodes.length),
        totalMinutes: increment(-totalRuntime),
      },
    },
    { merge: true },
  );

  await batch.commit();
}

export async function decrementSeasonWatchCount(
  userId: string,
  tmdbShowId: number,
  episodes: Array<{
    season: number;
    episode: number;
    runtime: number;
    watchCount: number;
  }>,
) {
  const batch = writeBatch(db);
  let totalRuntime = 0;
  let count = 0;

  for (const ep of episodes) {
    if (ep.watchCount <= 0) continue;
    const docId = episodeDocId(tmdbShowId, ep.season, ep.episode);
    const epRef = doc(watchedEpisodesRef(userId), docId);

    if (ep.watchCount <= 1) {
      batch.delete(epRef);
    } else {
      batch.update(epRef, { watchCount: increment(-1) });
    }
    totalRuntime += ep.runtime;
    count++;
  }

  if (count > 0) {
    batch.set(
      userRef(userId),
      {
        stats: {
          episodesWatched: increment(-count),
          totalMinutes: increment(-totalRuntime),
        },
      },
      { merge: true },
    );
  }

  await batch.commit();
}

export async function startRewatch(
  userId: string,
  tmdbId: number,
  mediaType: MediaType | "tv" | "movie",
) {
  const docId = showDocId(tmdbId, mediaType === MediaType.TV ? "tv" : "movie");
  await updateDoc(doc(trackingRef(userId), docId), {
    status: WatchStatus.REWATCHING,
    rewatchCount: increment(1),
    nextEpisode: { season: 1, episode: 1 },
    lastWatchedAt: serverTimestamp(),
    priorityDate: serverTimestamp(),
  });
}

export async function resumeWatching(
  userId: string,
  tmdbId: number,
  mediaType: MediaType | "tv" | "movie",
) {
  const docId = showDocId(tmdbId, mediaType === MediaType.TV ? "tv" : "movie");
  await updateDoc(doc(trackingRef(userId), docId), {
    status: WatchStatus.WATCHING,
  });
}

export async function resumeRewatch(
  userId: string,
  tmdbId: number,
  mediaType: MediaType | "tv" | "movie",
) {
  const docId = showDocId(tmdbId, mediaType === MediaType.TV ? "tv" : "movie");
  await updateDoc(doc(trackingRef(userId), docId), {
    status: WatchStatus.REWATCHING,
  });
}

export async function markMovieWatched(
  userId: string,
  tmdbId: number,
  runtime: number,
): Promise<void> {
  const batch = writeBatch(db);
  const movieRef = doc(watchedMoviesRef(userId), String(tmdbId));
  const tRef = doc(trackingRef(userId), showDocId(tmdbId, "movie"));
  const now = serverTimestamp();

  batch.set(
    movieRef,
    {
      tmdbId,
      lastWatchedAt: now,
      runtime: runtime || 0,
      watchCount: increment(1),
    },
    { merge: true },
  );

  batch.update(tRef, {
    status: WatchStatus.COMPLETED,
    lastWatchedAt: now,
    priorityDate: now,
  });

  batch.set(
    userRef(userId),
    {
      stats: {
        moviesWatched: increment(1),
        totalMinutes: increment(Math.round(runtime / 60)),
      },
    },
    { merge: true },
  );

  await batch.commit();
}

// --- Season batch mark (Cloud Function) ---

export async function markSeasonWatchedCF(
  tmdbId: number,
  seasonNumber: number,
  episodes: Array<{ episodeNumber: number; name: string; runtime: number }>,
  nextEpisode: { season: number; episode: number } | null,
  isShowComplete: boolean,
  nextEpisodeName: string | null = null,
  nextEpisodeAirDate: string | null = null,
): Promise<void> {
  const functions = getFunctions();
  try {
    await httpsCallable(
      functions,
      "markSeasonWatched",
    )({
      tmdbId,
      seasonNumber,
      episodes,
      nextEpisode,
      nextEpisodeName,
      nextEpisodeAirDate,
      isShowComplete,
    });
  } catch (err: any) {
    throw new Error(getCallableErrorMessage(err));
  }
}

// Keep backward-compatible aliases during transition
/** @deprecated Use addToTracking */
export const addToWatchlist = addToTracking as any;
/** @deprecated Use removeFromTracking */
export const removeFromWatchlist = removeFromTracking as any;

export {
  db,
  trackingRef,
  trackingRef as watchlistRef,
  watchedEpisodesRef,
  watchedMoviesRef,
  userRef,
};
