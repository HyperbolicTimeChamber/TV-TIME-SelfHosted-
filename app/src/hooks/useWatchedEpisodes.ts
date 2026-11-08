import { useCallback, useMemo } from "react";
import {
	getFirestore,
	collection,
	doc,
	query,
	where,
	orderBy,
	limit,
	startAfter,
	getDocs,
	QueryDocumentSnapshot,
	type Timestamp,
} from "@react-native-firebase/firestore";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { CacheKey } from "../enums";
import { useRestoredHistory, useSaveHistory, type HistoryPage } from "./watchedHistoryCache";
import { WatchedEpisode, QueryKey } from "../types";

export const WATCHED_EPISODES_PAGE_SIZE = 5;

interface WatchedEpisodesPage {
	episodes: WatchedEpisode[];
	lastDoc: QueryDocumentSnapshot | null;
}

export function useWatchedEpisodes(userId: string | undefined, tmdbShowId?: number) {
	const queryKey = [QueryKey.WATCHED_EPISODES, userId, tmdbShowId] as const;

	const queryClient = useQueryClient();
	// The all-titles history (Previously Watched) comes from the saved page all day; a title's
	// own history (its page) still fetches
	const allTitles = tmdbShowId === undefined;
	const restoredReady = useRestoredHistory(
		queryClient,
		queryKey,
		CacheKey.WATCHED_EPISODES_HISTORY,
		userId,
		allTitles,
		(page: HistoryPage<WatchedEpisode>) => ({ episodes: page.rows, lastDoc: page.lastDoc as QueryDocumentSnapshot | null }),
	);
	const {
		data,
		isLoading: loading,
		fetchNextPage,
		isFetchingNextPage: loadingMore,
		hasNextPage,
	} = useInfiniteQuery<WatchedEpisodesPage>({
		queryKey,
		queryFn: async ({ pageParam }) => {
			const db = getFirestore();
			const colRef = collection(doc(db, "users", userId!), "watchedEpisodes");

			const constraints: any[] = [orderBy("lastWatchedAt", "desc")];
			if (tmdbShowId !== undefined) {
				constraints.push(where("tmdbShowId", "==", tmdbShowId));
			}
			if (pageParam) {
				constraints.push(startAfter(pageParam));
			}
			constraints.push(limit(WATCHED_EPISODES_PAGE_SIZE));

			const snapshot = await getDocs(query(colRef, ...constraints));

			const episodes = snapshot.docs.map((d) => ({
				id: d.id,
				...d.data(),
			})) as WatchedEpisode[];

			return {
				episodes,
				lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
			};
		},
		initialPageParam: null as QueryDocumentSnapshot | null,
		getNextPageParam: (lastPage) =>
			lastPage.episodes.length >= WATCHED_EPISODES_PAGE_SIZE ? lastPage.lastDoc : undefined,
		enabled: !!userId && restoredReady,
		// All titles: today's page is kept (marks update it locally); a new day's launch refetches
		staleTime: allTitles ? Infinity : 5 * 60 * 1000,
	});

	const loaded = useMemo(() => data?.pages.flatMap((p) => p.episodes), [data]);
	const episodes = loaded ?? [];
	useSaveHistory(CacheKey.WATCHED_EPISODES_HISTORY, userId, allTitles, loaded, !!hasNextPage, WATCHED_EPISODES_PAGE_SIZE);

	const loadMore = useCallback(() => {
		if (hasNextPage && !loadingMore) {
			fetchNextPage();
		}
	}, [hasNextPage, loadingMore, fetchNextPage]);

	return { episodes, loading, loadMore, loadingMore, hasMore: !!hasNextPage };
}

/** Insert a watched episode into the query cache (no Firestore refetch). */
export function insertWatchedEpisodeCache(
	queryClient: { setQueryData: (key: any, updater: any) => void; getQueryData?: (key: any) => any },
	userId: string,
	ep: WatchedEpisode,
) {
	// The show's full list (if loaded) knows the episode's real count — a row added to the
	// paged list (episode watched long ago, not on a loaded page) must carry that + 1, not the
	// caller's guess: a rewatch mark added it at 1, and the watch count sheet then took 1 → 0
	// as "unwatched" and deleted a record that still had watches
	const showList = queryClient.getQueryData?.([QueryKey.WATCHED_EPISODES, userId, ep.tmdbShowId]);
	const known = Array.isArray(showList)
		? (showList as WatchedEpisode[]).find((e) => e.season === ep.season && e.episode === ep.episode)
		: undefined;
	const insertCount = known ? (known.watchCount || 0) + 1 : ep.watchCount;
	// Update paginated "all episodes" cache
	queryClient.setQueryData([QueryKey.WATCHED_EPISODES, userId, undefined], (old: any) => {
		if (!old?.pages) {
			return { pages: [{ episodes: [ep], lastDoc: null }], pageParams: [null] };
		}
		// Check if episode already exists in any page — update instead of duplicate
		let found = false;
		const updatedPages = old.pages.map((page: any) => ({
			...page,
			episodes: page.episodes.map((e: WatchedEpisode) => {
				if (e.tmdbShowId === ep.tmdbShowId && e.season === ep.season && e.episode === ep.episode) {
					found = true;
					return { ...e, watchCount: (e.watchCount || 0) + 1, lastWatchedAt: ep.lastWatchedAt };
				}
				return e;
			}),
		}));
		if (found) return { ...old, pages: updatedPages };
		// Not on a loaded page — prepend it, at its real count when known
		const firstPage = old.pages[0];
		// Its first watch stays its own (the caller's is the mark's "now"): an unwatch back to it
		// returns the row to that watch's place
		const row = {
			...ep,
			watchCount: insertCount,
			...(known?.watchedAt ? { watchedAt: known.watchedAt } : {}),
		};
		return {
			...old,
			pages: [{ ...firstPage, episodes: [row, ...firstPage.episodes] }, ...old.pages.slice(1)],
		};
	});
	// Update show-specific flat cache (used by useShowWatchedEpisodes)
	queryClient.setQueryData([QueryKey.WATCHED_EPISODES, userId, ep.tmdbShowId], (old: any) => {
		// Not loaded yet → leave empty so detail screen fetches the full list
		// (seeding [ep] would hide every other watched episode)
		if (!Array.isArray(old)) return old;
		const exists = old.some(
			(e: WatchedEpisode) => e.season === ep.season && e.episode === ep.episode,
		);
		if (exists) {
			return old.map((e: WatchedEpisode) =>
				e.season === ep.season && e.episode === ep.episode
					? { ...e, watchCount: (e.watchCount || 0) + 1, lastWatchedAt: ep.lastWatchedAt }
					: e,
			);
		}
		return [ep, ...old];
	});
}

/** Remove or decrement a watched episode in the query cache. */
export function removeWatchedEpisodeCache(
	queryClient: { setQueryData: (key: any, updater: any) => void },
	userId: string,
	tmdbShowId: number,
	season: number,
	episode: number,
	decrement?: boolean,
) {
	queryClient.setQueryData([QueryKey.WATCHED_EPISODES, userId, undefined], (old: any) => {
		if (!old?.pages) return old;
		return {
			...old,
			pages: old.pages.map((page: any) => ({
				...page,
				episodes: decrement
					? page.episodes.map((ep: WatchedEpisode) =>
							ep.tmdbShowId === tmdbShowId && ep.season === season && ep.episode === episode
								? { ...ep, watchCount: (ep.watchCount || 1) - 1 }
								: ep,
						)
					: page.episodes.filter(
							(ep: WatchedEpisode) =>
								!(ep.tmdbShowId === tmdbShowId && ep.season === season && ep.episode === episode),
						),
			})),
		};
	});
	// Also update show-specific flat cache (used by useShowWatchedEpisodes)
	queryClient.setQueryData([QueryKey.WATCHED_EPISODES, userId, tmdbShowId], (old: any) => {
		if (!Array.isArray(old)) return old;
		return decrement
			? old.map((ep: WatchedEpisode) =>
					ep.season === season && ep.episode === episode
						? { ...ep, watchCount: (ep.watchCount || 1) - 1 }
						: ep,
				)
			: old.filter((ep: WatchedEpisode) => !(ep.season === season && ep.episode === episode));
	});
}

/**
 * Set absolute watch counts ("season_episode" → n; 0 removes the row) in both cached lists —
 * the paged list the watchlist's rows read and the show's flat list. Absolute, not ±1: a list
 * that drifted (marks from elsewhere) is corrected instead of carrying the drift forward.
 */
export function setWatchedEpisodeCountsCache(
	queryClient: { setQueryData: (key: any, updater: any) => void },
	userId: string,
	tmdbShowId: number,
	counts: Map<string, number>,
	/** Watched again just now → these rows also take this lastWatchedAt (move to the top) */
	watchedAt?: Timestamp,
) {
	const apply = (eps: WatchedEpisode[], ofShow: (ep: WatchedEpisode) => boolean) =>
		eps.flatMap((ep) => {
			const n = ofShow(ep) ? counts.get(`${ep.season}_${ep.episode}`) : undefined;
			if (n === undefined) return [ep];
			if (n <= 0) return [];
			return [{ ...ep, watchCount: n, ...(watchedAt ? { lastWatchedAt: watchedAt } : {}) }];
		});
	queryClient.setQueryData([QueryKey.WATCHED_EPISODES, userId, undefined], (old: any) => {
		if (!old?.pages) return old;
		return {
			...old,
			pages: old.pages.map((page: any) => ({
				...page,
				episodes: apply(page.episodes, (ep) => ep.tmdbShowId === tmdbShowId),
			})),
		};
	});
	queryClient.setQueryData([QueryKey.WATCHED_EPISODES, userId, tmdbShowId], (old: any) =>
		Array.isArray(old) ? apply(old, () => true) : old,
	);
}
