import { useEffect, useState, useCallback, useRef } from "react";
import firestore, { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";
import { WatchedEpisode } from "../types";

const PAGE_SIZE = 20;

export function useWatchedEpisodes(
  userId: string | undefined,
  tmdbShowId?: number
) {
  const [episodes, setEpisodes] = useState<WatchedEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const lastDoc = useRef<FirebaseFirestoreTypes.QueryDocumentSnapshot | null>(null);

  const buildQuery = useCallback(() => {
    let query: FirebaseFirestoreTypes.Query = firestore()
      .collection("users")
      .doc(userId!)
      .collection("watchedEpisodes")
      .orderBy("lastWatchedAt", "desc");

    if (tmdbShowId !== undefined) {
      query = query.where("tmdbShowId", "==", tmdbShowId);
    }
    return query;
  }, [userId, tmdbShowId]);

  // Initial load
  useEffect(() => {
    if (!userId) {
      setEpisodes([]);
      setLoading(false);
      setHasMore(false);
      return;
    }

    lastDoc.current = null;
    setHasMore(true);

    const unsubscribe = buildQuery()
      .limit(PAGE_SIZE)
      .onSnapshot(
        (snapshot) => {
          const data = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as WatchedEpisode[];
          setEpisodes(data);
          setLoading(false);
          setHasMore(snapshot.docs.length >= PAGE_SIZE);
          lastDoc.current = snapshot.docs[snapshot.docs.length - 1] || null;
        },
        (error) => {
          console.error("WatchedEpisodes listener error:", error);
          setLoading(false);
        }
      );

    return unsubscribe;
  }, [userId, tmdbShowId, buildQuery]);

  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || loadingMore || !lastDoc.current) return;
    setLoadingMore(true);
    try {
      const snapshot = await buildQuery()
        .startAfter(lastDoc.current)
        .limit(PAGE_SIZE)
        .get();

      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as WatchedEpisode[];

      setEpisodes((prev) => [...prev, ...data]);
      setHasMore(snapshot.docs.length >= PAGE_SIZE);
      lastDoc.current = snapshot.docs[snapshot.docs.length - 1] || null;
    } finally {
      setLoadingMore(false);
    }
  }, [userId, hasMore, loadingMore, buildQuery]);

  return { episodes, loading, loadMore, loadingMore, hasMore };
}
