import JSZip from "jszip";
import Papa from "papaparse";
import * as FileSystem from "expo-file-system";

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
