import { useEffect, useState } from "react";
import {
  getFirestore,
  collection,
  doc,
  query,
  where,
  onSnapshot,
} from "@react-native-firebase/firestore";
import { WatchedEpisode } from "../types";

/**
 * Real-time listener for ALL watched episodes of a specific show.
 * Unlike useWatchedEpisodes (paginated), this fetches everything
 * so SeasonDropdown can accurately reflect watch status.
 */
export function useShowWatchedEpisodes(
  userId: string | undefined,
  tmdbShowId: number,
) {
  const [episodes, setEpisodes] = useState<WatchedEpisode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setEpisodes([]);
      setLoading(false);
      return;
    }

    const db = getFirestore();
    const colRef = collection(doc(db, "users", userId), "watchedEpisodes");
    const q = query(colRef, where("tmdbShowId", "==", tmdbShowId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const eps = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as WatchedEpisode[];
      setEpisodes(eps);
      setLoading(false);
    });

    return unsubscribe;
  }, [userId, tmdbShowId]);

  return { episodes, loading };
}
