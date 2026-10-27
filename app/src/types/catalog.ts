import { EpisodeType, MediaType } from "../enums";

export interface CatalogEpisode {
	episodeNumber: number;
	title: string;
	overview: string;
	airDate: string | null;
	runtime: number | null;
	stillPath: string | null;
	/** TMDB episode_type; missing on docs written before it was stored → not a finale */
	episodeType?: EpisodeType;
	/** Legacy flag (older docs: "last listed episode") — read episodeType instead */
	isSeasonFinale?: boolean;
	/** Exact UTC air time (TVMaze) — clients show the episode on their local day */
	airStamp?: string;
}

export interface CatalogSeason {
	seasonNumber: number;
	episodeCount: number;
	airDate: string | null;
	/** The season's own poster; null/missing → the show's poster stands in */
	posterPath?: string | null;
	episodes: CatalogEpisode[];
}

export interface CatalogShow {
	tmdbId: number;
	mediaType: MediaType;
	title: string;
	posterPath: string | null;
	backdropPath: string | null;
	overview: string;
	status: string;
	totalSeasons: number;
	totalEpisodes: number;
	runtime: number | null;
	voteAverage: number;
	firstAirDate: string | null;
	releaseDate: string | null;
	/** TMDB title logo (from the catalog doc only); null/missing = none */
	logoPath?: string | null;
	seasons: CatalogSeason[];
	genres?: string[];
	credits?: {
		directors: string[];
		writers: string[];
		producers: string[];
	};
	trackedBy: string[];
	trackedByCount: number;
	lastSyncedAt: any; // Firestore Timestamp
	/** Last shared TMDB refresh (refreshShow, epoch ms) */
	lastTmdbCheckAt?: number;
	/** Client-built stand-in (search add) — replace with the real catalog doc ASAP */
	partial?: boolean;
}
