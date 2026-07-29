import { MediaType } from "./enums";

export function showDocId(tmdbId: number, mediaType: MediaType): string {
	return `${mediaType}_${tmdbId}`;
}

export function parseTmdbId(docId: string): {
	tmdbId: number;
	mediaType: MediaType;
} {
	const match = docId.match(/^(tv|movie)_(\d+)$/);
	if (match) {
		return { mediaType: match[1] as MediaType, tmdbId: Number(match[2]) };
	}
	// Legacy format: bare number — assume TV (most common)
	return { mediaType: MediaType.TV, tmdbId: Number(docId) };
}

export function episodeDocId(tmdbId: number, season: number, episode: number): string {
	const s = String(season).padStart(2, "0");
	const e = String(episode).padStart(2, "0");
	return `${tmdbId}_S${s}E${e}`;
}
