import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { showDocId } from "./docId";
import { WatchStatus, MediaType } from "./enums";

interface EpisodeInput {
  episodeNumber: number;
  name: string;
  runtime: number;
}

interface MarkSeasonRequest {
  tmdbId: number;
  seasonNumber: number;
  episodes: EpisodeInput[];
  nextEpisode: { season: number; episode: number } | null;
  nextEpisodeName: string | null;
  nextEpisodeAirDate: string | null;
  isShowComplete: boolean;
}

function episodeDocId(tmdbId: number, season: number, episode: number): string {
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  return `${tmdbId}_S${s}E${e}`;
}

export const markSeasonWatched = onCall(
  {
    maxInstances: 10,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }
    if (request.data?.warmup) return { markedCount: 0 };

    const uid = request.auth.uid;
    const data = request.data as MarkSeasonRequest;
    const {
      tmdbId,
      seasonNumber,
      episodes,
      nextEpisode,
      nextEpisodeName,
      nextEpisodeAirDate,
      isShowComplete,
    } = data;

    if (!tmdbId || !seasonNumber || !episodes?.length) {
      throw new HttpsError("invalid-argument", "Missing required fields.");
    }

    if (episodes.length > 100) {
      throw new HttpsError("invalid-argument", "Too many episodes (max 100).");
    }

    const db = getFirestore();
    const userDoc = db.doc(`users/${uid}`);
    const trackingDoc = db.doc(
      `users/${uid}/tracking/${showDocId(tmdbId, MediaType.TV)}`,
    );
    const watchedCol = db.collection(`users/${uid}/watchedEpisodes`);

    // Read all existing episode docs in parallel
    const epRefs = episodes.map((ep) =>
      watchedCol.doc(episodeDocId(tmdbId, seasonNumber, ep.episodeNumber)),
    );
    const existingDocs = await db.getAll(...epRefs);

    const batch = db.batch();
    let totalRuntime = 0;
    const now = Timestamp.now();

    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i];
      const ref = epRefs[i];
      const existing = existingDocs[i];
      totalRuntime += ep.runtime || 0;

      if (existing.exists) {
        batch.update(ref, {
          watchCount: FieldValue.increment(1),
          lastWatchedAt: now,
        });
      } else {
        batch.set(ref, {
          tmdbShowId: tmdbId,
          season: seasonNumber,
          episode: ep.episodeNumber,
          episodeTitle: ep.name,
          watchedAt: now,
          lastWatchedAt: now,
          runtime: ep.runtime || 0,
          watchCount: 1,
        });
      }
    }

    // Update user stats
    batch.set(
      userDoc,
      {
        stats: {
          episodesWatched: FieldValue.increment(episodes.length),
          totalMinutes: FieldValue.increment(totalRuntime),
        },
      },
      { merge: true },
    );

    // Update tracking doc
    // If next episode hasn't aired yet, use its airDate as priorityDate
    let effectivePriority = now;
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
      nextEpisodeName: nextEpisodeName ?? null,
      nextEpisodeAirDate: nextEpisodeAirDate ?? null,
    };
    if (isShowComplete) {
      trackingUpdate.status = WatchStatus.COMPLETED;
    }
    batch.set(trackingDoc, trackingUpdate, { merge: true });

    await batch.commit();

    return { markedCount: episodes.length };
  },
);
