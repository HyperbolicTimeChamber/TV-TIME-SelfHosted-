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
  QueryDocumentSnapshot,
} from "@react-native-firebase/firestore";
import { UpcomingEpisode } from "../types";

const PAGE_SIZE = 20;

export function useUpcomingEpisodes(userId: string | undefined) {
  const [data, setData] = useState<UpcomingEpisode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const lastDoc = useRef<QueryDocumentSnapshot | null>(null);

  // Initial load
  useEffect(() => {
    if (!userId) {
      setData([]);
      setIsLoading(false);
      setHasMore(false);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const db = getFirestore();
    const upcomingCol = collection(doc(db, "users", userId), "upcoming");
    const q = query(
      upcomingCol,
      where("airDate", ">=", today),
      orderBy("airDate"),
      limit(PAGE_SIZE)
    );

    getDocs(q).then((snap) => {
      const eps = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as UpcomingEpisode[];

      setData(eps);
      lastDoc.current = snap.docs[snap.docs.length - 1] || null;
      setHasMore(snap.docs.length >= PAGE_SIZE);
      setIsLoading(false);
    }).catch((err) => {
      console.error("Upcoming load error:", err);
      setIsLoading(false);
    });
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || loadingMore || !lastDoc.current) return;
    setLoadingMore(true);

    try {
      const db = getFirestore();
      const upcomingCol = collection(doc(db, "users", userId), "upcoming");
      const q = query(
        upcomingCol,
        where("airDate", ">=", new Date().toISOString().slice(0, 10)),
        orderBy("airDate"),
        startAfter(lastDoc.current),
        limit(PAGE_SIZE)
      );

      const snap = await getDocs(q);
      const eps = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as UpcomingEpisode[];

      lastDoc.current = snap.docs[snap.docs.length - 1] || null;
      setHasMore(snap.docs.length >= PAGE_SIZE);
      setData((prev) => [...prev, ...eps]);
    } catch (err) {
      console.error("Upcoming loadMore error:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [userId, hasMore, loadingMore]);

  return { data, isLoading, loadMore, loadingMore, hasMore };
}
