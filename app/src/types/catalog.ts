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

/** A streaming service offering a title (functions StoredWatchProvider) */
export interface WatchProvider {
	id: number;
	name: string;
	/** TMDB image path of the service's logo */
	logo: string;
}

/** A title's streaming services in one country — an empty list means none (functions type) */
export interface RegionWatchProviders {
	providers: WatchProvider[];
	link: string | null;
	updatedAt: number;
}

/** One cast member (functions StoredCastMember) */
export interface CastMember {
	id: number;
	name: string;
	character: string | null;
	/** TMDB image path of their photo */
	profile: string | null;
	/** Shows: episodes they're in */
	episodes?: number;
}

/** A studio with a logo — the info page Studios row (functions StoredStudio) */
export interface Studio {
	id: number;
	name: string;
	/** TMDB image path of its logo */
	logo: string;
}

/** A movie's director with their photo (functions StoredCrewMember) */
export interface CrewMember {
	id: number;
	name: string;
	profile: string | null;
}

/** What the titleExtras CF answers (functions TitleExtras) */
export interface TitleExtras {
	/** Featured: a movie's leads / a show's regulars */
	cast: CastMember[];
	castTotal: number;
	directors: CrewMember[];
	/** Movies' writers — screenplay, story, novel */
	writers: CrewMember[];
	studios: Studio[];
	providers: RegionWatchProviders;
}

/** One page of the full cast (functions TitleCastPage) */
export interface TitleCastPage {
	members: CastMember[];
	total: number;
	hasMore: boolean;
}

export interface CatalogShow {
	/** Info page extras (titleExtras CF) — empty lists mean TMDB has none. Featured cast: */
	cast?: CastMember[];
	/** Everyone in the full cast (paged in the View All sheet) */
	castTotal?: number;
	/** A movie's directors with photos */
	directors?: CrewMember[];
	/** A movie's writers with photos */
	writers?: CrewMember[];
	/** Studios with logos (the info page row) — `studios` holds the names the Studio filter uses */
	studioLogos?: Studio[];
	/** Where to Watch, for the countries someone opened the info page from (watchProviders CF) */
	watchProviders?: Record<string, RegionWatchProviders>;
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
