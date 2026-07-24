import JSZip from "jszip";
import Papa from "papaparse";
import { File } from "expo-file-system";
import axios from "axios";

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
  episodeName: string | null;
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
  episode_name?: string;
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
      episodeName: r.episode_name || null,
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
  const file = new File(uri);
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

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
  totalSeasons: number | null;
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

function mapTMDBResults(
  results: any[],
  name: string,
  mediaType: "tv" | "movie",
): TMDBMatch[] {
  return results.map((r: any) => {
    const mt = (r.media_type || mediaType) as "tv" | "movie";
    return {
      tvTimeName: name,
      tmdbId: r.id,
      tmdbName: mt === "tv" ? r.name : r.title,
      posterPath: r.poster_path,
      mediaType: mt,
      year: (mt === "tv" ? r.first_air_date : r.release_date || "").slice(0, 4),
      overview: (r.overview || "").slice(0, 120),
      totalEpisodes: r.number_of_episodes ?? null,
      totalSeasons: r.number_of_seasons ?? null,
    };
  });
}

async function findByTvdbId(
  apiKey: string,
  tvdbId: number,
  name: string,
): Promise<TMDBMatch | null> {
  try {
    const res = await axios.get(`${TMDB_BASE}/find/${tvdbId}`, {
      params: { api_key: apiKey, external_source: "tvdb_id" },
    });
    const tvResults = res.data.tv_results || [];
    if (tvResults.length > 0) {
      const r = tvResults[0];
      return {
        tvTimeName: name,
        tvTimeId: tvdbId,
        tmdbId: r.id,
        tmdbName: r.name,
        posterPath: r.poster_path,
        mediaType: "tv",
        year: (r.first_air_date || "").slice(0, 4),
        overview: (r.overview || "").slice(0, 120),
        totalEpisodes: r.number_of_episodes ?? null,
        totalSeasons: r.number_of_seasons ?? null,
      };
    }
    return null;
  } catch (err: any) {
    if (err?.response?.status === 429) {
      const retryAfter = parseInt(
        err.response.headers["retry-after"] || "10",
        10,
      );
      await delay(retryAfter * 1000);
      return findByTvdbId(apiKey, tvdbId, name);
    }
    return null;
  }
}

async function searchTMDB(
  apiKey: string,
  name: string,
  mediaType: "tv" | "movie",
): Promise<TMDBMatch[]> {
  try {
    const endpoint = `${TMDB_BASE}/search/${mediaType}`;
    const res = await axios.get(endpoint, {
      params: { api_key: apiKey, query: name, page: 1 },
    });
    const results = (res.data.results || []).map((r: any) => ({
      ...r,
      media_type: mediaType,
    }));
    return mapTMDBResults(results, name, mediaType);
  } catch (err: any) {
    if (err?.response?.status === 429) {
      const retryAfter = parseInt(
        err.response.headers["retry-after"] || "10",
        10,
      );
      await delay(retryAfter * 1000);
      return searchTMDB(apiKey, name, mediaType);
    }
    return [];
  }
}

export async function searchTMDBPage(
  apiKey: string,
  name: string,
  mediaType: "tv" | "movie",
  page: number,
): Promise<{ results: TMDBMatch[]; totalPages: number }> {
  try {
    const endpoint = `${TMDB_BASE}/search/${mediaType}`;
    const res = await axios.get(endpoint, {
      params: { api_key: apiKey, query: name, page },
    });
    const results = (res.data.results || []).map((r: any) => ({
      ...r,
      media_type: mediaType,
    }));
    return {
      results: mapTMDBResults(results, name, mediaType),
      totalPages: res.data.total_pages || 1,
    };
  } catch {
    return { results: [], totalPages: 1 };
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
  onProgress: (done: number, total: number) => void,
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

    // Try TVDB ID lookup first for TV shows, name search for movies + fallback
    const results = await Promise.all(
      batch.map(async (item) => {
        // TV shows: try exact TVDB ID match first
        if (item.mediaType === "tv" && item.tvTimeId) {
          const tvdbMatch = await findByTvdbId(
            apiKey,
            item.tvTimeId,
            item.name,
          );
          if (tvdbMatch) return { exact: tvdbMatch };
        }
        // Fallback: name search
        const candidates = await searchTMDB(apiKey, item.name, item.mediaType);
        return { candidates };
      }),
    );

    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      const item = batch[j];

      if ("exact" in result && result.exact) {
        matched.push(result.exact);
        continue;
      }

      const candidates = result.candidates ?? [];
      const taggedCandidates = candidates.map((c) =>
        item.tvTimeId !== undefined ? { ...c, tvTimeId: item.tvTimeId } : c,
      );
      if (taggedCandidates.length === 0) {
        unmatched.push(item.name);
      } else if (taggedCandidates.length === 1) {
        matched.push(taggedCandidates[0]);
      } else {
        const exactMatch = taggedCandidates.find(
          (c) => c.tmdbName.toLowerCase() === item.name.toLowerCase(),
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

    if (i + BATCH_SIZE < items.length) {
      await delay(BATCH_DELAY_MS);
    }
  }

  return { matched, ambiguous, unmatched };
}

// --- Episode validation against catalog ---

interface CatalogSeason {
  seasonNumber: number;
  episodes: Array<{
    episodeNumber: number;
    title: string;
  }>;
}

interface CatalogForValidation {
  seasons: CatalogSeason[];
}

/**
 * Validate and remap episodes against catalog data.
 * If season/episode exists in catalog → keep as-is.
 * If not → search by episode name across all seasons.
 * If name match found → remap to correct season/episode.
 * If no match → drop the episode.
 */
export function validateEpisodesAgainstCatalog(
  episodes: Array<{ season: number; episode: number; episodeName?: string | null; watchedAt: string }>,
  catalog: CatalogForValidation,
): Array<{ season: number; episode: number; watchedAt: string }> {
  // Build lookup: season → episode set
  const epLookup = new Map<number, Set<number>>();
  for (const s of catalog.seasons) {
    epLookup.set(s.seasonNumber, new Set(s.episodes.map((e) => e.episodeNumber)));
  }

  return episodes
    .map((ep) => {
      // Check if episode exists at given position
      const seasonEps = epLookup.get(ep.season);
      if (seasonEps?.has(ep.episode)) {
        return { season: ep.season, episode: ep.episode, watchedAt: ep.watchedAt };
      }

      // Episode not found — try name search across all seasons
      if (ep.episodeName) {
        const normalizedName = ep.episodeName.toLowerCase().trim();
        for (const s of catalog.seasons) {
          for (const e of s.episodes) {
            if (e.title.toLowerCase().trim() === normalizedName) {
              return { season: s.seasonNumber, episode: e.episodeNumber, watchedAt: ep.watchedAt };
            }
          }
        }
      }

      // No match found → drop
      return null;
    })
    .filter((ep): ep is NonNullable<typeof ep> => ep !== null);
}

// --- Import Stats (returned by importMatches Cloud Function) ---

export interface ImportStats {
  showsImported: number;
  moviesImported: number;
  episodesImported: number;
  minutesImported: number;
  skipped: number;
}
