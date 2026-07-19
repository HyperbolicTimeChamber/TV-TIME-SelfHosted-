// app/src/hooks/useVisibleTracking.ts
import { WatchStatus, MediaType } from "../types";
import { EnrichedTrackingItem } from "./useWatchlist";

/**
 * Determines if a show should be visible in the "Currently Watching" list.
 * Uses nextEpisode from tracking doc (not watched episode counts) to determine
 * if there are unwatched aired episodes.
 *
 * Visible when:
 * - status is active AND nextEpisode has aired (unwatched content exists)
 * - plan_to_watch (always visible)
 *
 * Hidden when:
 * - status is completed/paused_rewatch
 * - nextEpisode is null (fully caught up / show ended)
 * - nextEpisode hasn't aired yet (caught up, waiting for new ep)
 */
export function isShowVisible(item: EnrichedTrackingItem): boolean {
  const activeStatuses: WatchStatus[] = [
    WatchStatus.WATCHING,
    WatchStatus.REWATCHING,
    WatchStatus.PLAN_TO_WATCH,
  ];
  if (!activeStatuses.includes(item.status)) return false;

  const today = new Date().toISOString().split("T")[0];

  // plan_to_watch — visible unless unreleased movie
  if (item.status === WatchStatus.PLAN_TO_WATCH) {
    const rd = item.releaseDate ?? item.catalogShow?.releaseDate;
    if (item.mediaType === MediaType.MOVIE && rd && rd > today) return false;
    return true;
  }

  // Movies — visible only if released (use tracking doc releaseDate first, fallback to catalog)
  if (item.mediaType === MediaType.MOVIE) {
    const rd = item.releaseDate ?? item.catalogShow?.releaseDate;
    if (rd && rd > today) return false;
    return true;
  }

  // No nextEpisode means fully caught up or completed
  const nextEp = item.nextEpisode;
  if (!nextEp) return false;

  // Use local nextEpisodeAirDate from tracking doc (no catalog dependency)
  const airDate = item.nextEpisodeAirDate;
  if (airDate) return airDate <= today;

  // Fallback to catalog if nextEpisodeAirDate not yet populated
  const catalog = item.catalogShow;
  if (!catalog) return false;

  const season = catalog.seasons?.find((s) => s.seasonNumber === nextEp.season);
  if (!season) return false;

  const episode = season.episodes?.find(
    (e) => e.episodeNumber === nextEp.episode,
  );
  if (!episode?.airDate) return false;
  return episode.airDate <= today;
}

/**
 * Get the air date of the next episode from the catalog data.
 * Returns ISO date string or null.
 */
function getNextEpisodeAirDate(item: EnrichedTrackingItem): string | null {
  // Prefer local field from tracking doc
  if (item.nextEpisodeAirDate) return item.nextEpisodeAirDate;
  // Fallback to catalog
  if (!item.nextEpisode || !item.catalogShow) return null;
  const season = item.catalogShow.seasons?.find(
    (s) => s.seasonNumber === item.nextEpisode!.season,
  );
  if (!season) return null;
  const episode = season.episodes?.find(
    (e) => e.episodeNumber === item.nextEpisode!.episode,
  );
  return episode?.airDate ?? null;
}

/**
 * Get the effective sort timestamp for an item.
 * Uses max(priorityDate, nextEpisodeAirDate or releaseDate).
 */
function getEffectivePriority(item: EnrichedTrackingItem): number {
  const priorityMs = item.priorityDate?.toMillis?.() ?? 0;

  let contentDateMs = 0;
  if (item.catalogShow?.mediaType === MediaType.MOVIE) {
    const rd = item.catalogShow.releaseDate;
    if (rd) contentDateMs = new Date(rd).getTime();
  } else {
    const airDate = getNextEpisodeAirDate(item);
    if (airDate) contentDateMs = new Date(airDate).getTime();
  }

  return Math.max(priorityMs, contentDateMs);
}

/**
 * Sort by effective priority descending.
 * Effective priority = max(priorityDate, nextEpisode.airDate or releaseDate)
 */
export function sortByPriority(
  items: EnrichedTrackingItem[],
): EnrichedTrackingItem[] {
  return [...items].sort((a, b) => {
    return getEffectivePriority(b) - getEffectivePriority(a);
  });
}
