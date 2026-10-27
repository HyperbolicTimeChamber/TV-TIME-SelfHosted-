import axios from "axios";
import { TVMAZE_BASE } from "../shared/enums";
import { CatalogSeason } from "../shared/types";

/** TVMaze allows 20 calls / 10 s per IP — space every call ~550 ms apart (module-wide) */
const MIN_GAP_MS = 550;
let nextSlot = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tvmazeGet<T>(path: string, params?: Record<string, string | number>): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = Date.now();
    const wait = Math.max(0, nextSlot - now);
    nextSlot = Math.max(now, nextSlot) + MIN_GAP_MS;
    if (wait) await sleep(wait);
    const res = await axios.get<T>(`${TVMAZE_BASE}${path}`, {
      params,
      timeout: 10_000,
      validateStatus: (s) => s < 500,
    });
    if (res.status === 429) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    return res.status === 200 ? res.data : null;
  }
  return null;
}

/** TVMaze show id from TMDB's external ids (TVDB first, then IMDb); null if not listed */
export async function lookupTvmazeId(ids: {
  tvdb_id?: number | null;
  imdb_id?: string | null;
}): Promise<number | null> {
  if (ids.tvdb_id) {
    const show = await tvmazeGet<{ id: number }>("/lookup/shows", { thetvdb: ids.tvdb_id });
    if (show) return show.id;
  }
  if (ids.imdb_id) {
    const show = await tvmazeGet<{ id: number }>("/lookup/shows", { imdb: ids.imdb_id });
    if (show) return show.id;
  }
  return null;
}

interface TvmazeEpisode {
  season: number;
  number: number | null;
  airstamp: string | null;
}

/** "season_episode" → UTC airstamp for every numbered episode TVMaze has */
export async function fetchTvmazeAirStamps(tvmazeId: number): Promise<Map<string, string>> {
  const eps = await tvmazeGet<TvmazeEpisode[]>(`/shows/${tvmazeId}/episodes`);
  const stamps = new Map<string, string>();
  for (const ep of eps ?? []) {
    if (ep.number != null && ep.airstamp) stamps.set(`${ep.season}_${ep.number}`, ep.airstamp);
  }
  return stamps;
}

const DAY_MS = 86_400_000;

/**
 * Put TVMaze airstamps on TMDB's episodes. Numbering can differ between the two
 * (anime, specials), so a stamp is only trusted within a day of TMDB's air date.
 */
export function applyAirStamps(seasons: CatalogSeason[], stamps: Map<string, string>) {
  for (const season of seasons) {
    for (const ep of season.episodes) {
      const stamp = stamps.get(`${season.seasonNumber}_${ep.episodeNumber}`);
      if (!stamp) continue;
      if (ep.airDate) {
        const drift = Math.abs(Date.parse(stamp) - Date.parse(`${ep.airDate}T12:00:00Z`));
        if (drift > 1.5 * DAY_MS) continue;
      }
      ep.airStamp = stamp;
    }
  }
}

/** Worth asking TVMaze: still airing and something aired in the last week or is coming */
export function needsAirStamps(seasons: CatalogSeason[], ended: boolean): boolean {
  if (ended) return false;
  const cutoff = new Date(Date.now() - 7 * DAY_MS).toISOString().slice(0, 10);
  return seasons.some((s) => s.episodes.some((e) => !e.airDate || e.airDate >= cutoff));
}
