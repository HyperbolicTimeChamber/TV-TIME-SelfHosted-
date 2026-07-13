// app/src/hooks/useVisibleTracking.ts
import { EnrichedTrackingItem } from "./useWatchlist";

/**
 * Determines if a show should be visible in the "Currently Watching" list.
 *
 * Visible when:
 * - status is watching/rewatching/plan_to_watch
 * - AND has unwatched episodes that have already aired
 *
 * Hidden when:
 * - All aired eps watched + next ep not yet aired
 * - All aired eps watched + show ended (no more eps)
 * - status is completed
 */
export function isShowVisible(
  item: EnrichedTrackingItem,
  watchedEpisodeCount: number
): boolean {
  const activeStatuses = ["watching", "rewatching", "plan_to_watch"];
  if (!activeStatuses.includes(item.status)) return false;

  // plan_to_watch with no watched eps — always visible
  if (item.status === "plan_to_watch" && watchedEpisodeCount === 0) {
    return true;
  }

  const catalog = item.catalogShow;
  if (!catalog || catalog.mediaType === "movie") return true;

  // Count aired episodes
  const today = new Date().toISOString().split("T")[0];
  let airedEpCount = 0;
  for (const season of catalog.seasons) {
    for (const ep of season.episodes) {
      if (ep.airDate && ep.airDate <= today) {
        airedEpCount++;
      }
    }
  }

  // If all aired eps are watched, check if there's upcoming content
  if (watchedEpisodeCount >= airedEpCount) {
    // Check if any future episode exists
    let hasFutureEp = false;
    for (const season of catalog.seasons) {
      for (const ep of season.episodes) {
        if (ep.airDate && ep.airDate > today) {
          hasFutureEp = true;
          break;
        }
      }
      if (hasFutureEp) break;
    }

    // All caught up — hide regardless of future eps
    return false;
  }

  // Has unwatched aired episodes — visible
  return true;
}

/**
 * Sort by priorityDate descending.
 * Items are already sorted by Firestore query if using orderBy,
 * but this handles client-side re-sort after visibility filtering.
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
