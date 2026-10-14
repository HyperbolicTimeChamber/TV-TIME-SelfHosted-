import { MediaType } from "../enums";

/** Data for the show drawer (title tap on watchlist / upcoming cards) */
export interface ShowDrawerData {
	tmdbId?: number;
	title: string;
	posterPath: string | null;
	backdropPath: string | null;
	overview: string | null;
	mediaType?: MediaType;
	year?: string | null;
	totalSeasons?: number | null;
	totalEpisodes?: number | null;
	runtime?: number | null;
	status?: string | null;
	genres?: string | null;
	voteAverage?: number | null;
}
