import { useEffect, useState, useRef } from "react";
import {
  getFirestore,
  doc,
  onSnapshot,
} from "@react-native-firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { UserStats } from "../types";

const defaultStats: UserStats = {
  episodesWatched: 0,
  showsTracking: 0,
  moviesWatched: 0,
  totalMinutes: 0,
};

const CACHE_KEY = "profile_stats_cache";

export function useUserStats(userId: string | undefined) {
  const [stats, setStats] = useState<UserStats>(defaultStats);
  const [loading, setLoading] = useState(true);
  const restoredCache = useRef(false);

  // Restore cached stats on mount
  useEffect(() => {
    if (!userId || restoredCache.current) return;
    AsyncStorage.getItem(CACHE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const cached = JSON.parse(raw);
        if (cached.userId === userId) {
          setStats(cached.stats);
          setLoading(false);
        }
      } catch {}
      restoredCache.current = true;
    });
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setStats(defaultStats);
      setLoading(false);
      return;
    }

    const db = getFirestore();
    const docRef = doc(db, "users", userId);

    const unsubscribe = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const fresh = data?.stats ?? defaultStats;
          setStats(fresh);
          AsyncStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ userId, stats: fresh }),
          ).catch(() => {});
        }
        setLoading(false);
      },
      (error) => {
        console.error("UserStats listener error:", error);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [userId]);

  return { stats, loading };
}
