import { useEffect, useState, useRef } from "react";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  onSnapshot,
} from "@react-native-firebase/firestore";
import { TrackingItem, CatalogShow } from "../types";

export interface EnrichedTrackingItem extends TrackingItem {
  title: string;
  posterPath: string | null;
  totalEpisodes: number;
  catalogShow: CatalogShow | null;
}

export function useWatchlist(userId: string | undefined) {
  const [items, setItems] = useState<EnrichedTrackingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const catalogCache = useRef<Map<string, CatalogShow | null>>(new Map());

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    const db = getFirestore();
    const colRef = collection(doc(db, "users", userId), "tracking");

    const unsubscribe = onSnapshot(
      colRef,
      async (snapshot) => {
        const trackingItems = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as TrackingItem[];

        // Enrich with catalog data
        const enriched = await Promise.all(
          trackingItems.map(async (item): Promise<EnrichedTrackingItem> => {
            const key = String(item.tmdbId);
            let catalogShow = catalogCache.current.get(key);

            if (catalogShow === undefined) {
              try {
                const showDoc = await getDoc(doc(db, "shows", key));
                catalogShow = showDoc.exists()
                  ? ({ id: showDoc.id, ...showDoc.data() } as unknown as CatalogShow)
                  : null;
              } catch {
                catalogShow = null;
              }
              catalogCache.current.set(key, catalogShow);
            }

            return {
              ...item,
              title: catalogShow?.title ?? `Show #${item.tmdbId}`,
              posterPath: catalogShow?.posterPath ?? null,
              totalEpisodes: catalogShow?.totalEpisodes ?? 0,
              catalogShow: catalogShow ?? null,
            };
          })
        );

        setItems(enriched);
        setLoading(false);
      },
      (error) => {
        console.error("Tracking listener error:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [userId]);

  return { items, loading };
}
