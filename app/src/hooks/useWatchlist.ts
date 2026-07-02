import { useEffect, useState } from "react";
import firestore from "@react-native-firebase/firestore";
import { WatchlistItem } from "../types";

export function useWatchlist(userId: string | undefined) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    const unsubscribe = firestore()
      .collection("users")
      .doc(userId)
      .collection("watchlist")
      .onSnapshot(
        (snapshot) => {
          const data = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as WatchlistItem[];
          setItems(data);
          setLoading(false);
        },
        (error) => {
          console.error("Watchlist listener error:", error);
          setLoading(false);
        }
      );

    return unsubscribe;
  }, [userId]);

  return { items, loading };
}
