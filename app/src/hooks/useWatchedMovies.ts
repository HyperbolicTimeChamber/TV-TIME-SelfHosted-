import { useState, useEffect } from "react";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  orderBy,
} from "@react-native-firebase/firestore";
import { WatchedMovie } from "../types";

export function useWatchedMovies(userId?: string) {
  const [movies, setMovies] = useState<WatchedMovie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setMovies([]);
      setLoading(false);
      return;
    }

    const db = getFirestore();
    const q = query(
      collection(db, "users", userId, "watchedMovies"),
      orderBy("lastWatchedAt", "desc"),
    );

    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as WatchedMovie[];
      setMovies(items);
      setLoading(false);
    });

    return unsub;
  }, [userId]);

  return { movies, loading };
}
