import { useEffect, useState } from "react";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
} from "@react-native-firebase/firestore";
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

    const db = getFirestore();
    const colRef = collection(doc(db, "users", userId), "watchlist");

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const data = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
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
