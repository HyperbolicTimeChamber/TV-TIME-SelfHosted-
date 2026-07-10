import { useEffect, useState, useCallback, useRef } from "react";
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
  onSnapshot,
  QueryDocumentSnapshot,
  Query,
} from "@react-native-firebase/firestore";
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
  const lastDoc = useRef<QueryDocumentSnapshot | null>(null);

  const buildQuery = useCallback(() => {
    const db = getFirestore();
    const colRef = collection(doc(db, "users", userId!), "watchedEpisodes");

    const constraints = [orderBy("lastWatchedAt", "desc")];
    if (tmdbShowId !== undefined) {
      constraints.push(where("tmdbShowId", "==", tmdbShowId) as any);
    }
    return query(colRef, ...constraints);
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

    const q = query(buildQuery() as Query, limit(PAGE_SIZE));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
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
      const q = query(
        buildQuery() as Query,
        startAfter(lastDoc.current),
        limit(PAGE_SIZE)
      );
      const snapshot = await getDocs(q);

      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
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
