import { useMemo } from "react";
import { MediaType, RECENTLY_WATCHED_COUNT } from "../enums";
import { latestEntries } from "../utils/historyView";
import { useWatchHistory } from "./useWatchHistory";
import { getCachedCatalogShow } from "./useWatchlist";

export interface RecentlyWatchedItem {
	tmdbId: number;
	mediaType: MediaType;
	title: string;
	posterPath: string | null;
}

/**
 * The titles watched most recently, TV and movies together — Watch History's own cached lists
 * (quiet delta refresh, no extra queries once cached), poster + title from the catalog cache.
 */
export function useRecentlyWatched(): { items: RecentlyWatchedItem[]; loading: boolean } {
	const tv = useWatchHistory(MediaType.TV);
	const movies = useWatchHistory(MediaType.MOVIE);
	const items = useMemo(() => {
		const titles = new Map([...tv.cards, ...movies.cards].map((c) => [c.id, c.title]));
		return latestEntries([tv.entries, movies.entries], RECENTLY_WATCHED_COUNT).map((e) => {
			const catalog = getCachedCatalogShow(e.tmdbId, e.mediaType);
			return {
				tmdbId: e.tmdbId,
				mediaType: e.mediaType,
				title: catalog?.title ?? titles.get(e.id) ?? "",
				posterPath: catalog?.posterPath ?? null,
			};
		});
	}, [tv.entries, tv.cards, movies.entries, movies.cards]);
	return { items, loading: tv.loading && movies.loading };
}
