import { EnrichedTrackingItem } from "../hooks";
import { WatchedEpisode, WatchedMovie } from "./user";

export type WatchlistListItem =
	| { type: "sectionHeader"; title: string }
	| { type: "show"; item: EnrichedTrackingItem }
	| {
			type: "watchedEpisode";
			episode: WatchedEpisode;
			show: EnrichedTrackingItem;
	  }
	| {
			type: "watchedMovie";
			movie: WatchedMovie;
			show: EnrichedTrackingItem;
	  }
	/** Nothing left up next (but there's watch history) — the "all caught up" card */
	| { type: "caughtUp" };
