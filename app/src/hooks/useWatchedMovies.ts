import { useCallback, useMemo } from "react";
import {
	getFirestore,
	collection,
	doc,
	query,
	orderBy,
	limit,
	startAfter,
	getDocs,
	QueryDocumentSnapshot,
} from "@react-native-firebase/firestore";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { CacheKey } from "../enums";
import { useRestoredHistory, useSaveHistory, type HistoryPage } from "./watchedHistoryCache";
import { WatchedMovie, QueryKey } from "../types";

export const WATCHED_MOVIES_PAGE_SIZE = 5;

interface WatchedMoviesPage {
	movies: WatchedMovie[];
	lastDoc: QueryDocumentSnapshot | null;
}

export function useWatchedMovies(userId?: string) {
	const queryKey = [QueryKey.WATCHED_MOVIES, userId] as const;

	const queryClient = useQueryClient();
	// Previously Watched's movie history: from the saved page all day
	const restoredReady = useRestoredHistory(
		queryClient,
		queryKey,
		CacheKey.WATCHED_MOVIES_HISTORY,
		userId,
		true,
		(page: HistoryPage<WatchedMovie>) => ({ movies: page.rows, lastDoc: page.lastDoc as QueryDocumentSnapshot | null }),
	);
	const {
		data,
		isLoading: loading,
		fetchNextPage,
		isFetchingNextPage: loadingMore,
		hasNextPage,
	} = useInfiniteQuery<WatchedMoviesPage>({
		queryKey,
		queryFn: async ({ pageParam }) => {
			const db = getFirestore();
			const colRef = collection(doc(db, "users", userId!), "watchedMovies");

			const constraints: any[] = [orderBy("lastWatchedAt", "desc")];
			if (pageParam) {
				constraints.push(startAfter(pageParam));
			}
			constraints.push(limit(WATCHED_MOVIES_PAGE_SIZE));

			const snapshot = await getDocs(query(colRef, ...constraints));

			const movies = snapshot.docs.map((d) => ({
				id: d.id,
				...d.data(),
			})) as WatchedMovie[];

			return {
				movies,
				lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
			};
		},
		initialPageParam: null as QueryDocumentSnapshot | null,
		getNextPageParam: (lastPage) =>
			lastPage.movies.length >= WATCHED_MOVIES_PAGE_SIZE ? lastPage.lastDoc : undefined,
		enabled: !!userId && restoredReady,
		// Today's page is kept (marks update it locally); a new day's launch refetches
		staleTime: Infinity,
	});

	const loaded = useMemo(() => data?.pages.flatMap((p) => p.movies), [data]);
	const movies = loaded ?? [];
	useSaveHistory(CacheKey.WATCHED_MOVIES_HISTORY, userId, true, loaded, !!hasNextPage, WATCHED_MOVIES_PAGE_SIZE);

	const loadMore = useCallback(() => {
		if (hasNextPage && !loadingMore) {
			fetchNextPage();
		}
	}, [hasNextPage, loadingMore, fetchNextPage]);

	return { movies, loading, loadMore, loadingMore, hasMore: !!hasNextPage };
}

/** Insert or update a watched movie in the query cache (no Firestore refetch). */
export function insertWatchedMovieCache(
	queryClient: { setQueryData: (key: any, updater: any) => void },
	userId: string,
	movie: WatchedMovie,
) {
	queryClient.setQueryData([QueryKey.WATCHED_MOVIES, userId], (old: any) => {
		if (!old?.pages) {
			return { pages: [{ movies: [movie], lastDoc: null }], pageParams: [null] };
		}
		// Check if movie already exists in any page
		const exists = old.pages.some((p: any) =>
			p.movies.some((m: WatchedMovie) => m.tmdbId === movie.tmdbId),
		);
		if (exists) {
			// Update existing entry (increment count, update timestamp)
			return {
				...old,
				pages: old.pages.map((p: any) => ({
					...p,
					movies: p.movies.map((m: WatchedMovie) =>
						m.tmdbId === movie.tmdbId
							? { ...m, watchCount: (m.watchCount || 0) + 1, lastWatchedAt: movie.lastWatchedAt }
							: m,
					),
				})),
			};
		}
		const firstPage = old.pages[0];
		return {
			...old,
			pages: [{ ...firstPage, movies: [movie, ...firstPage.movies] }, ...old.pages.slice(1)],
		};
	});
}
