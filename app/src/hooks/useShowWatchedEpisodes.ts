import { useEffect, useState } from "react";
import {
  getFirestore,
  collection,
  doc,
  query,
  where,
  getDocs,
} from "@react-native-firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { WatchedEpisode, QueryKey } from "../types";

/**
 * One-time fetch of ALL watched episodes for a specific show.
 * Uses React Query cache so subsequent opens don't re-read Firestore.
 * Local mutations (insertWatchedEpisodeCache / removeWatchedEpisodeCache)
 * update the same query key → UI stays in sync without a real-time listener.
 */
export function useShowWatchedEpisodes(
  userId: string | undefined,
  tmdbShowId: number,
) {
  const queryClient = useQueryClient();
  const [episodes, setEpisodes] = useState<WatchedEpisode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setEpisodes([]);
      setLoading(false);
      return;
    }

    // Check React Query cache first
    const cached = queryClient.getQueryData<WatchedEpisode[]>([
      QueryKey.WATCHED_EPISODES,
      userId,
      tmdbShowId,
    ]);
    if (cached) {
      setEpisodes(cached);
      setLoading(false);
      return;
    }

    // One-time Firestore read
    const db = getFirestore();
    const colRef = collection(doc(db, "users", userId), "watchedEpisodes");
    const q = query(colRef, where("tmdbShowId", "==", tmdbShowId));

    getDocs(q).then((snapshot) => {
      const eps = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as WatchedEpisode[];
      queryClient.setQueryData(
        [QueryKey.WATCHED_EPISODES, userId, tmdbShowId],
        eps,
      );
      setEpisodes(eps);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [userId, tmdbShowId, queryClient]);

  // Subscribe to React Query cache updates (from insertWatchedEpisodeCache etc.)
  useEffect(() => {
    if (!userId) return;
    const unsub = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        event.query.queryKey[0] === QueryKey.WATCHED_EPISODES &&
        event.query.queryKey[1] === userId &&
        event.query.queryKey[2] === tmdbShowId
      ) {
        const data = event.query.state.data as WatchedEpisode[] | undefined;
        if (data) setEpisodes(data);
      }
    });
    return unsub;
  }, [userId, tmdbShowId, queryClient]);

  return { episodes, loading };
}
