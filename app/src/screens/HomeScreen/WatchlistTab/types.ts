import { EnrichedTrackingItem } from "../../../hooks";
import { WatchedEpisode } from "../../../types";

export type ListItem =
  | { type: "sectionHeader"; title: string }
  | { type: "show"; item: EnrichedTrackingItem }
  | {
      type: "watchedEpisode";
      episode: WatchedEpisode;
      show: EnrichedTrackingItem;
    };
