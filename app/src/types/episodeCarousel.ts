export interface CarouselEpisode {
	season: number;
	episode: number;
	title: string | null;
	airDate: string | null;
	runtime: number | null;
	stillPath: string | null;
	overview: string | null;
}

export interface EnrichedEpisode extends CarouselEpisode {
	loaded?: boolean;
}

export interface EpisodeDetailModalProps {
	visible: boolean;
	tmdbId: number;
	showTitle: string;
	showPosterPath: string | null;
	showBackdropPath: string | null;
	episodes: CarouselEpisode[];
	initialIndex: number;
	watchedKeys: Map<string, number>;
	currentNextEpisode: { season: number; episode: number } | null;
	/** Rewatch run number while rewatching (0/undefined = first watch). An episode counts
	 *  as watched in this run only once its watch count exceeds it. */
	rewatchCount?: number;
	/** `runtime`: the card's runtime (TMDB) — used when the stored catalog has none yet */
	onMarkWatched: (
		tmdbId: number,
		season: number,
		episode: number,
		runtime?: number | null,
	) => Promise<void>;
	/** May resolve with the episodes it actually marked — the carousel mirrors exactly those
	 *  (otherwise every episode from the current next one through the target) */
	onMarkWatchedThrough: (
		tmdbId: number,
		season: number,
		episode: number,
	) => Promise<void | Array<{ season: number; episode: number }>>;
	onUnmarkWatched: (tmdbId: number, season: number, episode: number) => Promise<void>;
	/** Skip the current episode without watching it (watchlist rewatches only) */
	onSkipEpisode?: (tmdbId: number, season: number, episode: number) => Promise<void>;
	onShowPress?: () => void;
	onClose: () => void;
	onLoadEpisodeDetails?: (season: number) => Promise<CarouselEpisode[] | null>;
	onIndexChange?: (index: number, total: number) => void;
	/** Info only (e.g. from the Calendar): no watch / unwatch / skip buttons */
	readOnly?: boolean;
}
