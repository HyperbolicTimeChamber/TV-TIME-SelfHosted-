import { useEffect } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { QueryKey } from "../types";
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
} from "@react-native-firebase/firestore";

export function useTrackedIds(userId: string | undefined) {
  const queryClient = useQueryClient();

  // Seed cache with snapshot listener
  useEffect(() => {
    if (!userId) return;

    const db = getFirestore();
    const colRef = collection(doc(db, "users", userId), "tracking");

    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const tracked = new Set<number>();
      for (const d of snapshot.docs) {
        // Handle prefixed IDs: "tv_12345" → 12345
        const raw = d.id.replace(/^(tv|movie)_/, "");
        tracked.add(Number(raw));
      }
      queryClient.setQueryData([QueryKey.TRACKED_IDS, userId], tracked);
    });

    return unsubscribe;
  }, [userId, queryClient]);

  const { data: ids = new Set<number>() } = useQuery<Set<number>>({
    queryKey: [QueryKey.TRACKED_IDS, userId],
    queryFn: () => new Set<number>(),
    enabled: !!userId,
    staleTime: Infinity,
  });

  return ids;
}
