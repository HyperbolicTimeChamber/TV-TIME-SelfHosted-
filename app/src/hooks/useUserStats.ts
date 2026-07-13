import { useEffect, useState } from "react";
import {
  getFirestore,
  doc,
  onSnapshot,
} from "@react-native-firebase/firestore";
import { UserStats } from "../types";

const defaultStats: UserStats = {
  episodesWatched: 0,
  showsTracking: 0,
  moviesWatched: 0,
  totalMinutes: 0,
};

export function useUserStats(userId: string | undefined) {
  const [stats, setStats] = useState<UserStats>(defaultStats);
  const [loading, setLoading] = useState(true);

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
          setStats(data?.stats ?? defaultStats);
        }
        setLoading(false);
      },
      (error) => {
        console.error("UserStats listener error:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userId]);

  return { stats, loading };
}
