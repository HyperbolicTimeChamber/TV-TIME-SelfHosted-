import { useEffect, useState } from "react";
import firestore, { FirebaseFirestoreTypes } from "@react-native-firebase/firestore";
import { WatchedEpisode } from "../types";

export function useWatchedEpisodes(
  userId: string | undefined,
  tmdbShowId?: number
) {
  const [episodes, setEpisodes] = useState<WatchedEpisode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setEpisodes([]);
      setLoading(false);
      return;
    }

    let query: FirebaseFirestoreTypes.Query = firestore()
      .collection("users")
      .doc(userId)
      .collection("watchedEpisodes");

    if (tmdbShowId !== undefined) {
      query = query.where("tmdbShowId", "==", tmdbShowId);
    }

    const unsubscribe = query.onSnapshot(
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as WatchedEpisode[];
        setEpisodes(data);
        setLoading(false);
      },
      (error) => {
        console.error("WatchedEpisodes listener error:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userId, tmdbShowId]);

  return { episodes, loading };
}
