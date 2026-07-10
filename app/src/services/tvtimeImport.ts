import JSZip from "jszip";
import Papa from "papaparse";
import * as FileSystem from "expo-file-system";
import axios from "axios";
import firestore, { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";
import { WatchStatus } from "../types";

// --- Parsed types ---

export interface ParsedShow {
  tvTimeId: number;
  name: string;
  isArchived: boolean;
  isForLater: boolean;
  followedAt: string | null;
  rewatchCount: number;
  epWatchCount: number;
}

export interface ParsedEpisode {
  tvTimeShowId: number;
  showName: string;
  season: number;
  episode: number;
  watchedAt: string;
}

export interface ParsedMovie {
  name: string;
  watchedAt: string;
  runtimeSeconds: number;
  releaseDate: string;
}

export interface ParsedGdprData {
  shows: ParsedShow[];
  watchedEpisodes: ParsedEpisode[];
  rewatchedEpisodes: ParsedEpisode[];
  movies: ParsedMovie[];
}

// --- CSV row types (raw) ---

interface V2Row {
  key: string;
  s_id: string;
  season_number: string;
  episode_number: string;
  created_at: string;
  series_name: string;
  is_archived: string;
  is_for_later: string;
  followed_at: string;
  rewatch_count: string;
  ep_watch_count: string;
}

interface V1Row {
  type: string;
  entity_type: string;
  movie_name: string;
  created_at: string;
  runtime: string;
  release_date: string;
}

// --- Parsing ---

async function readCsvFromZip(zip: JSZip, filename: string): Promise<string> {
  const file = zip.file(filename);
  if (!file) throw new Error(`Missing ${filename} in zip`);
  return file.async("string");
}

function parseCsv<T>(csvString: string): T[] {
  const result = Papa.parse<T>(csvString, {
    header: true,
    skipEmptyLines: true,
  });
  return result.data;
}

function parseV2Shows(rows: V2Row[]): ParsedShow[] {
  return rows
    .filter((r) => r.key.startsWith("user-series-"))
    .map((r) => ({
      tvTimeId: parseInt(r.s_id, 10),
      name: r.series_name,
      isArchived: r.is_archived === "true",
      isForLater: r.is_for_later === "true",
      followedAt: r.followed_at || null,
      rewatchCount: parseInt(r.rewatch_count, 10) || 0,
      epWatchCount: parseInt(r.ep_watch_count, 10) || 0,
    }));
}

function parseV2Episodes(rows: V2Row[], prefix: string): ParsedEpisode[] {
  return rows
    .filter((r) => r.key.startsWith(prefix))
    .filter((r) => r.season_number && r.episode_number)
    .map((r) => ({
      tvTimeShowId: parseInt(r.s_id, 10),
      showName: r.series_name,
      season: parseInt(r.season_number, 10),
      episode: parseInt(r.episode_number, 10),
      watchedAt: r.created_at,
    }));
}

function parseV1Movies(rows: V1Row[]): ParsedMovie[] {
  return rows
    .filter((r) => r.type === "watch" && r.entity_type === "movie")
    .filter((r) => r.movie_name)
    .map((r) => ({
      name: r.movie_name,
      watchedAt: r.created_at,
      runtimeSeconds: parseInt(r.runtime, 10) || 0,
      releaseDate: r.release_date || "",
    }));
}

export async function parseGdprZip(uri: string): Promise<ParsedGdprData> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const zip = await JSZip.loadAsync(base64, { base64: true });

  const v2Csv = await readCsvFromZip(zip, "tracking-prod-records-v2.csv");
  const v2Rows = parseCsv<V2Row>(v2Csv);

  const v1Csv = await readCsvFromZip(zip, "tracking-prod-records.csv");
  const v1Rows = parseCsv<V1Row>(v1Csv);

  return {
    shows: parseV2Shows(v2Rows),
    watchedEpisodes: parseV2Episodes(v2Rows, "watch-episode-"),
    rewatchedEpisodes: parseV2Episodes(v2Rows, "rewatch-episode-"),
    movies: parseV1Movies(v1Rows),
  };
}

// --- TMDB Matching ---

export interface TMDBMatch {
  tvTimeName: string;
  tvTimeId?: number; // only for TV shows
  tmdbId: number;
  tmdbName: string;
  posterPath: string | null;
  mediaType: "tv" | "movie";
  year: string;
  overview: string;
  totalEpisodes: number | null;
}

export interface AmbiguousMatch {
  tvTimeName: string;
  mediaType: "tv" | "movie";
  candidates: TMDBMatch[];
}

export interface MatchResult {
  matched: TMDBMatch[];
  ambiguous: AmbiguousMatch[];
  unmatched: string[];
}

const TMDB_BASE = "https://api.themoviedb.org/3";
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchTMDB(
  apiKey: string,
  name: string,
  mediaType: "tv" | "movie"
): Promise<TMDBMatch[]> {
  try {
    const res = await axios.get(`${TMDB_BASE}/search/${mediaType}`, {
      params: { api_key: apiKey, query: name, page: 1 },
    });
    const results = res.data.results || [];
    return results.slice(0, 5).map((r: any) => ({
      tvTimeName: name,
      tmdbId: r.id,
      tmdbName: mediaType === "tv" ? r.name : r.title,
      posterPath: r.poster_path,
      mediaType,
      year: (mediaType === "tv" ? r.first_air_date : r.release_date || "").slice(0, 4),
      overview: (r.overview || "").slice(0, 120),
      totalEpisodes: r.number_of_episodes ?? null,
    }));
  } catch (err: any) {
    if (err?.response?.status === 429) {
      const retryAfter = parseInt(err.response.headers["retry-after"] || "10", 10);
      await delay(retryAfter * 1000);
      return searchTMDB(apiKey, name, mediaType);
    }
    return [];
  }
}

interface MatchItem {
  name: string;
  mediaType: "tv" | "movie";
}

export async function matchShowsAndMovies(
  apiKey: string,
  shows: ParsedShow[],
  movies: ParsedMovie[],
  onProgress: (done: number, total: number) => void
): Promise<MatchResult> {
  // Deduplicate shows by tvTimeId so two shows with the same name each get their own TMDB search
  const seenShowIds = new Set<number>();
  const showItems: (MatchItem & { tvTimeId: number })[] = [];
  for (const s of shows) {
    if (!seenShowIds.has(s.tvTimeId)) {
      seenShowIds.add(s.tvTimeId);
      showItems.push({ name: s.name, mediaType: "tv", tvTimeId: s.tvTimeId });
    }
  }

  const movieNames = [...new Set(movies.map((m) => m.name))];

  const items: (MatchItem & { tvTimeId?: number })[] = [
    ...showItems,
    ...movieNames.map((n) => ({ name: n, mediaType: "movie" as const })),
  ];

  const matched: TMDBMatch[] = [];
  const ambiguous: AmbiguousMatch[] = [];
  const unmatched: string[] = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((item) => searchTMDB(apiKey, item.name, item.mediaType))
    );

    for (let j = 0; j < batch.length; j++) {
      const candidates = results[j];
      const item = batch[j];
      // Attach tvTimeId to every candidate so we can key by it later
      const taggedCandidates = candidates.map((c) =>
        item.tvTimeId !== undefined ? { ...c, tvTimeId: item.tvTimeId } : c
      );
      if (taggedCandidates.length === 0) {
        unmatched.push(item.name);
      } else if (taggedCandidates.length === 1) {
        matched.push(taggedCandidates[0]);
      } else {
        // Check if first result is exact name match — auto-select
        const exactMatch = taggedCandidates.find(
          (c) => c.tmdbName.toLowerCase() === item.name.toLowerCase()
        );
        if (exactMatch) {
          matched.push(exactMatch);
        } else {
          ambiguous.push({
            tvTimeName: item.name,
            mediaType: item.mediaType,
            candidates: taggedCandidates,
          });
        }
      }
    }

    onProgress(Math.min(i + BATCH_SIZE, items.length), items.length);

    // Delay between batches (skip after last batch)
    if (i + BATCH_SIZE < items.length) {
      await delay(BATCH_DELAY_MS);
    }
  }

  return { matched, ambiguous, unmatched };
}

// --- Firestore Import ---

export interface ImportStats {
  showsImported: number;
  moviesImported: number;
  episodesImported: number;
  minutesImported: number;
  skipped: number;
}

function episodeDocId(tmdbShowId: number, season: number, episode: number) {
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  return `${tmdbShowId}_S${s}E${e}`;
}

function deriveStatus(show: ParsedShow): WatchStatus {
  if (show.isArchived) return "completed";
  if (show.isForLater) return "plan_to_watch";
  return "watching";
}

function parseTimestamp(dateStr: string | null): FirebaseFirestoreTypes.Timestamp | null {
  if (!dateStr || dateStr === "0001-01-01 00:00:00") return null;
  const ms = new Date(dateStr).getTime();
  if (isNaN(ms)) return null;
  return firestore.Timestamp.fromMillis(ms);
}

export async function importToFirestore(
  userId: string,
  selectedMatches: TMDBMatch[],
  shows: ParsedShow[],
  watchedEpisodes: ParsedEpisode[],
  rewatchedEpisodes: ParsedEpisode[],
  movies: ParsedMovie[],
  onProgress: (done: number, total: number) => void
): Promise<ImportStats> {
  const db = firestore();
  const userRef = db.collection("users").doc(userId);
  const watchlistRef = userRef.collection("watchlist");
  const watchedEpRef = userRef.collection("watchedEpisodes");

  const stats: ImportStats = {
    showsImported: 0,
    moviesImported: 0,
    episodesImported: 0,
    minutesImported: 0,
    skipped: 0,
  };

  // Build tvTimeId → TMDBMatch lookup for TV shows (keyed by tvTimeId, not name)
  const matchByTvTimeId = new Map<number, TMDBMatch>();
  for (const m of selectedMatches) {
    if (m.mediaType === "tv" && m.tvTimeId !== undefined) {
      matchByTvTimeId.set(m.tvTimeId, m);
    }
  }

  // Build tvTimeName → TMDBMatch lookup for movies (no tvTimeId, name is unique enough)
  const matchByMovieName = new Map<string, TMDBMatch>();
  for (const m of selectedMatches) {
    if (m.mediaType === "movie" && !matchByMovieName.has(m.tvTimeName)) {
      matchByMovieName.set(m.tvTimeName, m);
    }
  }

  // Collect all operations as { ref, data } pairs
  type WriteOp = { ref: FirebaseFirestoreTypes.DocumentReference; data: Record<string, any> };
  const ops: WriteOp[] = [];

  // --- Watchlist: Shows ---
  const selectedShowMatches = selectedMatches.filter((m) => m.mediaType === "tv");
  for (const match of selectedShowMatches) {
    const show =
      match.tvTimeId !== undefined
        ? shows.find((s) => s.tvTimeId === match.tvTimeId)
        : shows.find((s) => s.name === match.tvTimeName);
    if (!show) continue;
    const status = deriveStatus(show);
    const addedAt = parseTimestamp(show.followedAt) || firestore.Timestamp.now();

    // Find latest watched episode date for this show
    const showEps = watchedEpisodes.filter((e) => e.tvTimeShowId === show.tvTimeId);
    let lastWatchedAt: FirebaseFirestoreTypes.Timestamp | null = null;
    if (showEps.length > 0) {
      const latest = showEps.reduce((a, b) =>
        new Date(a.watchedAt) > new Date(b.watchedAt) ? a : b
      );
      lastWatchedAt = parseTimestamp(latest.watchedAt);
    }

    ops.push({
      ref: watchlistRef.doc(String(match.tmdbId)),
      data: {
        tmdbId: match.tmdbId,
        mediaType: "tv",
        title: match.tmdbName,
        posterPath: match.posterPath || "",
        addedAt,
        lastWatchedAt,
        status,
        nextEpisode: null,
        rewatchCount: show.rewatchCount,
        totalEpisodes: match.totalEpisodes ?? null,
      },
    });
  }

  // --- Watchlist: Movies ---
  const selectedMovieMatches = selectedMatches.filter((m) => m.mediaType === "movie");
  for (const match of selectedMovieMatches) {
    const movie = movies.find((m) => m.name === match.tvTimeName);
    if (!movie) continue;
    const watchedAt = parseTimestamp(movie.watchedAt) || firestore.Timestamp.now();

    ops.push({
      ref: watchlistRef.doc(String(match.tmdbId)),
      data: {
        tmdbId: match.tmdbId,
        mediaType: "movie",
        title: match.tmdbName,
        posterPath: match.posterPath || "",
        addedAt: watchedAt,
        lastWatchedAt: watchedAt,
        status: "completed" as WatchStatus,
        nextEpisode: null,
        rewatchCount: 0,
        totalEpisodes: null,
        // runtimeMinutes intentionally omitted — tracked in stats only
      },
    });
  }

  // --- Watched Episodes ---
  // Merge watch + rewatch into per-episode counts
  const epCountMap = new Map<string, { season: number; episode: number; tmdbShowId: number; firstWatched: string; lastWatched: string; count: number }>();

  for (const ep of watchedEpisodes) {
    const match = matchByTvTimeId.get(ep.tvTimeShowId);
    if (!match) continue;
    const key = episodeDocId(match.tmdbId, ep.season, ep.episode);
    const existing = epCountMap.get(key);
    if (existing) {
      existing.count++;
      if (new Date(ep.watchedAt) < new Date(existing.firstWatched)) existing.firstWatched = ep.watchedAt;
      if (new Date(ep.watchedAt) > new Date(existing.lastWatched)) existing.lastWatched = ep.watchedAt;
    } else {
      epCountMap.set(key, {
        season: ep.season,
        episode: ep.episode,
        tmdbShowId: match.tmdbId,
        firstWatched: ep.watchedAt,
        lastWatched: ep.watchedAt,
        count: 1,
      });
    }
  }

  for (const ep of rewatchedEpisodes) {
    const match = matchByTvTimeId.get(ep.tvTimeShowId);
    if (!match) continue;
    const key = episodeDocId(match.tmdbId, ep.season, ep.episode);
    const existing = epCountMap.get(key);
    if (existing) {
      existing.count++;
      if (new Date(ep.watchedAt) > new Date(existing.lastWatched)) existing.lastWatched = ep.watchedAt;
    } else {
      epCountMap.set(key, {
        season: ep.season,
        episode: ep.episode,
        tmdbShowId: match.tmdbId,
        firstWatched: ep.watchedAt,
        lastWatched: ep.watchedAt,
        count: 1,
      });
    }
  }

  for (const [docId, ep] of epCountMap) {
    ops.push({
      ref: watchedEpRef.doc(docId),
      data: {
        tmdbShowId: ep.tmdbShowId,
        season: ep.season,
        episode: ep.episode,
        episodeTitle: "",
        watchedAt: parseTimestamp(ep.firstWatched) || firestore.Timestamp.now(),
        lastWatchedAt: parseTimestamp(ep.lastWatched) || firestore.Timestamp.now(),
        runtime: 0,
        watchCount: ep.count,
      },
    });
  }

  // --- Split ops: watchlist items need existence checks; episode writes are idempotent ---
  const watchlistOps = ops.filter(
    (op) => op.data.mediaType === "tv" || op.data.mediaType === "movie"
  );
  const episodeOps = ops.filter(
    (op) => op.data.tmdbShowId !== undefined && op.data.season !== undefined
  );

  // Accumulate movie minutes from parsed data (not from the Firestore doc field)
  for (const match of selectedMovieMatches) {
    const movie = movies.find((m) => m.name === match.tvTimeName);
    if (movie) stats.minutesImported += Math.round(movie.runtimeSeconds / 60);
  }

  // Check existence only for watchlist items (~shows + movies, manageable count)
  const existingDocs = new Set<string>();
  for (let i = 0; i < watchlistOps.length; i += 10) {
    const chunk = watchlistOps.slice(i, i + 10);
    const snapshots = await Promise.all(chunk.map((op) => op.ref.get()));
    for (const snap of snapshots) {
      if (snap.exists()) existingDocs.add(snap.ref.path);
    }
  }

  const totalOps = ops.length;
  let done = 0;
  let watchingCount = 0;

  // Write in Firestore batches of 500
  const BATCH_LIMIT = 500;
  const allOps = [...watchlistOps, ...episodeOps];
  for (let i = 0; i < allOps.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    let batchCount = 0;
    const chunk = allOps.slice(i, i + BATCH_LIMIT);

    for (const op of chunk) {
      const isEpisode = op.data.tmdbShowId !== undefined && op.data.season !== undefined;
      if (!isEpisode && existingDocs.has(op.ref.path)) {
        stats.skipped++;
      } else {
        batch.set(op.ref, op.data);
        batchCount++;
        // Count stats only for written ops
        if (op.data.mediaType === "tv" && op.data.status) {
          stats.showsImported++;
          if (op.data.status === "watching") watchingCount++;
        } else if (op.data.mediaType === "movie") {
          stats.moviesImported++;
        } else if (isEpisode) {
          stats.episodesImported++;
        }
      }
    }

    if (batchCount > 0) {
      try {
        await batch.commit();
      } catch (err) {
        // Retry once on transient failure
        try {
          await batch.commit();
        } catch {
          stats.skipped += batchCount;
        }
      }
    }
    done += chunk.length;
    onProgress(done, totalOps);
  }

  await userRef.update({
    "stats.episodesWatched": firestore.FieldValue.increment(stats.episodesImported + stats.moviesImported),
    "stats.showsTracking": firestore.FieldValue.increment(watchingCount),
    "stats.totalMinutes": firestore.FieldValue.increment(stats.minutesImported),
  });

  return stats;
}
