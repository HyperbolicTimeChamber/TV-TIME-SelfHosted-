import { Timestamp } from "firebase-admin/firestore";
import { MediaType } from "../../shared/enums";

export interface HistoryTotals {
  historyAt: Timestamp;
  minutesWatched: number;
  plays: number;
  /** TV: the most recently watched episode */
  lastEpisode?: { season: number; episode: number };
}

interface WatchedDoc {
  runtime?: number;
  watchCount?: number;
  lastWatchedAt?: Timestamp;
  season?: number;
  episode?: number;
}

/** Fold watch docs into per-key totals: Σ runtime × watchCount, Σ watchCount, latest watch */
function fold(
  totals: Map<string, HistoryTotals>,
  key: string,
  d: WatchedDoc,
) {
  const count = d.watchCount ?? 1;
  const prev = totals.get(key);
  const at = d.lastWatchedAt;
  const keepPrev = !!prev && (!at || prev.historyAt.toMillis() >= at.toMillis());
  const latest = keepPrev
    ? prev.historyAt
    : (at ?? prev?.historyAt ?? Timestamp.fromMillis(0));
  const thisEp =
    d.season && d.episode ? { season: d.season, episode: d.episode } : undefined;
  const lastEpisode = keepPrev ? prev.lastEpisode : (thisEp ?? prev?.lastEpisode);
  totals.set(key, {
    ...(lastEpisode ? { lastEpisode } : {}),
    historyAt: latest,
    minutesWatched: (prev?.minutesWatched ?? 0) + (d.runtime ?? 0) * count,
    plays: (prev?.plays ?? 0) + count,
  });
}

/**
 * Per tracking-doc totals from a user's watchedEpisodes + watchedMovies, keyed by
 * tracking doc id (tv_123 / movie_456). Rewatches count (watchCount).
 */
export function aggregateHistory(
  watchedEpisodes: Array<WatchedDoc & { tmdbShowId?: number }>,
  watchedMovies: Array<WatchedDoc & { tmdbId?: number }>,
): Map<string, HistoryTotals> {
  const totals = new Map<string, HistoryTotals>();
  for (const ep of watchedEpisodes) {
    if (ep.tmdbShowId) fold(totals, `${MediaType.TV}_${ep.tmdbShowId}`, ep);
  }
  for (const m of watchedMovies) {
    if (m.tmdbId) fold(totals, `${MediaType.MOVIE}_${m.tmdbId}`, m);
  }
  return totals;
}

/** Fields to write so the tracking doc matches totals; null = already correct */
export function historyPatch(
  current: Record<string, unknown>,
  totals: HistoryTotals | undefined,
): Record<string, unknown> | null {
  const curAt = current.historyAt as Timestamp | undefined;
  if (!totals || totals.plays <= 0) {
    // Never watched (or everything unmarked) → not in history (historyAt null = delete)
    return curAt || current.plays ? { historyAt: null, plays: 0 } : null;
  }
  const curLast = current.lastEpisode as { season: number; episode: number } | undefined;
  const same =
    current.plays === totals.plays &&
    current.minutesWatched === totals.minutesWatched &&
    curAt?.toMillis() === totals.historyAt.toMillis() &&
    curLast?.season === totals.lastEpisode?.season &&
    curLast?.episode === totals.lastEpisode?.episode;
  if (same) return null;
  return {
    historyAt: totals.historyAt,
    minutesWatched: totals.minutesWatched,
    plays: totals.plays,
    ...(totals.lastEpisode ? { lastEpisode: totals.lastEpisode } : {}),
  };
}
