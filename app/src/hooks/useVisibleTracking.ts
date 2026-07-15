// app/src/hooks/useVisibleTracking.ts
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
  const activeStatuses = ["watching", "rewatching", "plan_to_watch"];
  if (!activeStatuses.includes(item.status)) return false;

  // plan_to_watch — always visible
  if (item.status === "plan_to_watch") return true;

  const catalog = item.catalogShow;

  // Movies — visible if active
  if (!catalog || catalog.mediaType === "movie") return true;

  // No nextEpisode means fully caught up or completed
  const nextEp = item.nextEpisode;
  if (!nextEp) return false;

  // Check if nextEpisode has aired
  const today = new Date().toISOString().split("T")[0];
  const season = catalog.seasons?.find((s) => s.seasonNumber === nextEp.season);
  if (!season) {
    // Season not in catalog — might not exist yet
    return false;
  }

  const episode = season.episodes?.find((e) => e.episodeNumber === nextEp.episode);
  if (!episode) {
    // Episode not in catalog — might not exist yet
    return false;
  }

  // Visible if the next episode has already aired
  if (!episode.airDate) return false; // No air date = not aired yet
  return episode.airDate <= today;
}

/**
 * Sort by priorityDate descending.
 */
export function sortByPriority(
  items: EnrichedTrackingItem[]
): EnrichedTrackingItem[] {
  return [...items].sort((a, b) => {
    const aDate = a.priorityDate?.toMillis?.() ?? 0;
    const bDate = b.priorityDate?.toMillis?.() ?? 0;
    return bDate - aDate;
  });
}
