import { MediaType, TmdbProxyAction } from "../enums";

export interface RemoveShowRequest {
	tmdbId: number;
	mediaType: MediaType;
}

export interface EpisodeInput {
	episodeNumber: number;
	name: string;
	runtime: number;
}

export interface MarkSeasonRequest {
	tmdbId: number;
	seasonNumber: number;
	episodes: EpisodeInput[];
	nextEpisode: { season: number; episode: number } | null;
	nextEpisodeName: string | null;
	nextEpisodeAirDate: string | null;
	isShowComplete: boolean;
}

export interface ProxyRequest {
	action: TmdbProxyAction;
	warmup?: boolean;
	query?: string;
	page?: number;
	mediaType?: string;
	tmdbId?: number;
	tvdbId?: number;
	seasonNumber?: number;
	startDate?: string;
	endDate?: string;
	timeWindow?: string;
}
