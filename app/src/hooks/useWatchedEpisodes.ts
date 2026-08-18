import { useCallback } from "react";
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
} from "@react-native-firebase/firestore";
import { useInfiniteQuery } from "@tanstack/react-query";
import { WatchedEpisode, QueryKey } from "../types";

const PAGE_SIZE = 5;

interface WatchedEpisodesPage {
	episodes: WatchedEpisode[];
	lastDoc: QueryDocumentSnapshot | null;
}

export function useWatchedEpisodes(userId: string | undefined, tmdbShowId?: number) {
	const queryKey = [QueryKey.WATCHED_EPISODES, userId, tmdbShowId] as const;

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
			constraints.push(limit(PAGE_SIZE));

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
			lastPage.episodes.length >= PAGE_SIZE ? lastPage.lastDoc : undefined,
		enabled: !!userId,
		staleTime: 5 * 60 * 1000,
	});

	const episodes = data?.pages.flatMap((p) => p.episodes) ?? [];

	const loadMore = useCallback(() => {
		if (hasNextPage && !loadingMore) {
			fetchNextPage();
		}
	}, [hasNextPage, loadingMore, fetchNextPage]);

	return { episodes, loading, loadMore, loadingMore, hasMore: !!hasNextPage };
}

/** Insert a watched episode into the query cache (no Firestore refetch). */
export function insertWatchedEpisodeCache(
	queryClient: { setQueryData: (key: any, updater: any) => void },
	userId: string,
	ep: WatchedEpisode,
) {
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
		// New episode — prepend to first page
		const firstPage = old.pages[0];
		return {
			...old,
			pages: [{ ...firstPage, episodes: [ep, ...firstPage.episodes] }, ...old.pages.slice(1)],
		};
	});
	// Update show-specific flat cache (used by useShowWatchedEpisodes)
	queryClient.setQueryData([QueryKey.WATCHED_EPISODES, userId, ep.tmdbShowId], (old: any) => {
		if (!Array.isArray(old)) return [ep];
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
