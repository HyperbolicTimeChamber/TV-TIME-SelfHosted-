export function showDocId(tmdbId: number, mediaType: "tv" | "movie"): string {
  return `${mediaType}_${tmdbId}`;
}
