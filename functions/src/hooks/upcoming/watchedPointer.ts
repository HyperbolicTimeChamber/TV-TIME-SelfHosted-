export interface EpisodePointer {
  season: number;
  episode: number;
}

/**
 * True when (season, episode) comes before the tracking doc's nextEpisode pointer —
 * i.e. the user already watched it. A null pointer (caught up / unknown) says
 * nothing, so nothing is treated as watched.
 */
export function isBeforePointer(
  season: number,
  episode: number,
  pointer: EpisodePointer | null | undefined,
): boolean {
  if (!pointer) return false;
  return (
    season < pointer.season ||
    (season === pointer.season && episode < pointer.episode)
  );
}
