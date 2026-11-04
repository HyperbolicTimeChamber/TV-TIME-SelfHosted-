import { WatchStatus } from "../shared/enums";
import { CatalogShow } from "../shared/types";

type EpisodeRef = { season: number; episode: number };

/**
 * A TV tracking doc marked completed while its pointer still sits on an episode that has aired
 * isn't finished — a real completion leaves no pointer (or one on an episode still to come).
 * TV Time imports did this: an archived (dropped) show came in completed after 2 of 16
 * episodes. Such a doc is really being watched.
 */
export function isUnfinishedCompleted(
  status: string | undefined,
  next: EpisodeRef | null | undefined,
  catalog: Pick<CatalogShow, "seasons"> | undefined,
  today: string,
): boolean {
  if (status !== WatchStatus.COMPLETED || !next || !catalog?.seasons?.length) return false;
  const ep = catalog.seasons
    .find((s) => s.seasonNumber === next.season)
    ?.episodes?.find((e) => e.episodeNumber === next.episode);
  return !!ep?.airDate && ep.airDate <= today;
}
