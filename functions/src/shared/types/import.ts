import { MediaType, WatchStatus } from "../enums";

export interface ImportEpisode {
	season: number;
	episode: number;
	watchedAt: string;
}

export interface ImportMatch {
	tmdbId: number;
	mediaType: MediaType;
	status: WatchStatus.WATCHING | WatchStatus.COMPLETED | WatchStatus.PLAN_TO_WATCH;
	watchedEpisodes?: ImportEpisode[];
	movieRuntime?: number;
	movieWatchedAt?: string;
}

export interface ImportRequest {
	matches: ImportMatch[];
}

export interface ImportStats {
	showsImported: number;
	moviesImported: number;
	episodesImported: number;
	minutesImported: number;
}
