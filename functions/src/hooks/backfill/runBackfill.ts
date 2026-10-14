import axios from "axios";
import { FieldValue } from "firebase-admin/firestore";
import { MediaType, TMDB_BASE } from "../../shared/enums";
import { TMDBLogo } from "../../shared/types";
import { pickLogo, pooled } from "../tmdb";
import { aggregateHistory, historyPatch } from "./aggregateHistory";

export interface BackfillOptions {
  dryRun: boolean;
  /** Users processed in parallel */
  userConcurrency?: number;
  /** TMDB requests in flight (TMDB allows ~40/s) */
  tmdbConcurrency?: number;
}

/**
 * Watch History fields on every tracking doc, recomputed from watchedEpisodes +
 * watchedMovies (absolute values → safe to rerun; unchanged docs aren't written).
 * Per user: 3 collection reads, writes through one BulkWriter (batched, throttled, retried).
 */
export async function backfillHistory(
  db: FirebaseFirestore.Firestore,
  { dryRun, userConcurrency = 5 }: BackfillOptions,
) {
  const users = await db.collection("users").listDocuments();
  const writer = db.bulkWriter();
  let docsWritten = 0;

  const tasks = users.map((user) => async () => {
    const [tracking, episodes, movies] = await Promise.all([
      user.collection("tracking").get(),
      user.collection("watchedEpisodes").get(),
      user.collection("watchedMovies").get(),
    ]);
    const totals = aggregateHistory(
      episodes.docs.map((d) => d.data()),
      movies.docs.map((d) => d.data()),
    );
    for (const t of tracking.docs) {
      const patch = historyPatch(t.data(), totals.get(t.id));
      if (!patch) continue;
      docsWritten++;
      if (dryRun) continue;
      writer.set(
        t.ref,
        {
          ...patch,
          ...(patch.historyAt === null ? { historyAt: FieldValue.delete() } : {}),
          historyUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  });

  await pooled(tasks, userConcurrency);
  await writer.close();
  return { users: users.length, docsWritten };
}

/**
 * logoPath on every catalog doc that doesn't have the field yet (null = TMDB has no
 * logo, so it's never asked again). One light /images request per show.
 */
export async function backfillLogos(
  db: FirebaseFirestore.Firestore,
  apiKey: string,
  { dryRun, tmdbConcurrency = 20 }: BackfillOptions,
) {
  const shows = await db.collection("shows").get();
  const missing = shows.docs.filter((d) => !("logoPath" in d.data()));
  const writer = db.bulkWriter();
  let found = 0;
  let failed = 0;

  const tasks = missing.map((d) => async () => {
    const { tmdbId, mediaType } = d.data() as { tmdbId: number; mediaType: MediaType };
    const kind = mediaType === MediaType.MOVIE ? "movie" : "tv";
    try {
      const { data } = await axios.get<{ logos?: TMDBLogo[] }>(
        `${TMDB_BASE}/${kind}/${tmdbId}/images`,
        { params: { api_key: apiKey, include_image_language: "en,null" } },
      );
      const logoPath = pickLogo(data.logos);
      if (logoPath) found++;
      if (!dryRun) writer.update(d.ref, { logoPath });
    } catch {
      // Left without the field → picked up by the next run
      failed++;
    }
  });

  await pooled(tasks, tmdbConcurrency);
  await writer.close();
  return { shows: shows.size, checked: missing.length, found, failed };
}
