import { EnrichedTrackingItem } from "../../../hooks";
import { WatchedEpisode, WatchedMovie } from "../../../types";

export type ListItem =
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
	  };
