export interface TMDBEpisode {
	episode_number: number;
	name: string;
	overview: string;
	air_date: string | null;
	runtime: number | null;
	still_path: string | null;
}

export interface TMDBSeasonDetail {
	season_number: number;
	episodes: TMDBEpisode[];
	air_date: string | null;
}

export interface TMDBShowDetail {
	id: number;
	name?: string;
	title?: string;
	poster_path: string | null;
	backdrop_path: string | null;
	overview: string;
	status: string;
	number_of_seasons?: number;
	number_of_episodes?: number;
	runtime?: number | null;
	episode_run_time?: number[];
	first_air_date?: string;
	release_date?: string;
	vote_average: number;
	genres?: Array<{ id: number; name: string }>;
	seasons?: Array<{
		season_number: number;
		episode_count: number;
		air_date: string | null;
	}>;
}
