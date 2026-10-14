import { MediaType, WatchStatus } from "../enums";

/** One Watch History row — the tracking doc's history fields, timestamps as ms (persistable) */
export interface HistoryEntry {
	/** tracking doc id: tv_123 / movie_456 */
	id: string;
	tmdbId: number;
	mediaType: MediaType;
	status: WatchStatus;
	nextEpisode: { season: number; episode: number } | null;
	rewatchCount: number;
	historyAt: number;
	historyUpdatedAt: number;
	minutesWatched: number;
	plays: number;
}

/** Cached list for one tab */
export interface HistoryState {
	userId: string;
	items: HistoryEntry[];
	/** More pages on the server after the last item */
	hasMore: boolean;
	/** Newest historyUpdatedAt seen — delta-sync cursor (ms) */
	checkedAt: number;
}

/** Local write that touched a tracking doc — emitted by services, patches the cache */
export interface HistoryChange {
	userId: string;
	tmdbId: number;
	mediaType: MediaType;
	/** A watch happened → historyAt = now, card moves to the top */
	watched?: boolean;
	minutesDelta?: number;
	playsDelta?: number;
	/** Everything unwatched → card leaves history */
	cleared?: boolean;
	status?: WatchStatus;
	/** undefined = unchanged */
	nextEpisode?: { season: number; episode: number } | null;
	rewatchDelta?: number;
}
