import { MediaType } from "../enums";

export function showDocId(tmdbId: number, mediaType: MediaType): string {
  return `${mediaType}_${tmdbId}`;
}
