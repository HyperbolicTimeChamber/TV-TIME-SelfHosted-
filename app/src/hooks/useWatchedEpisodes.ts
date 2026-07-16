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
import { WatchedEpisode } from "../types";

const PAGE_SIZE = 5;

interface WatchedEpisodesPage {
  episodes: WatchedEpisode[];
  lastDoc: QueryDocumentSnapshot | null;
}

export function useWatchedEpisodes(
  userId: string | undefined,
  tmdbShowId?: number
) {
  const queryKey = ["watchedEpisodes", userId, tmdbShowId] as const;

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

      console.log(`[WatchedEpisodes] Fetched ${episodes.length} eps, hasMore=${episodes.length >= PAGE_SIZE}`);

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
