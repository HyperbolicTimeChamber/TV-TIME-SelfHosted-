import { useEffect, useState } from "react";
import firestore from "@react-native-firebase/firestore";
import { UserStats } from "../types";

const defaultStats: UserStats = {
  episodesWatched: 0,
  showsTracking: 0,
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

    const unsubscribe = firestore()
      .collection("users")
      .doc(userId)
      .onSnapshot(
        (doc) => {
          if (doc.exists()) {
            const data = doc.data();
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
