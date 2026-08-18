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
	onMarkWatched: (tmdbId: number, season: number, episode: number) => Promise<void>;
	onMarkWatchedThrough: (tmdbId: number, season: number, episode: number) => Promise<void>;
	onUnmarkWatched: (tmdbId: number, season: number, episode: number) => Promise<void>;
	onShowPress?: () => void;
	onClose: () => void;
	onLoadEpisodeDetails?: (season: number) => Promise<CarouselEpisode[] | null>;
	onIndexChange?: (index: number, total: number) => void;
}
