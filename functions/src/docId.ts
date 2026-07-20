export function showDocId(tmdbId: number, mediaType: "tv" | "movie"): string {
  return `${mediaType}_${tmdbId}`;
}

export function parseTmdbId(docId: string): { tmdbId: number; mediaType: "tv" | "movie" } {
  const match = docId.match(/^(tv|movie)_(\d+)$/);
  if (match) {
    return { mediaType: match[1] as "tv" | "movie", tmdbId: Number(match[2]) };
  }
  // Legacy format: bare number — assume TV (most common)
  return { mediaType: "tv", tmdbId: Number(docId) };
}
