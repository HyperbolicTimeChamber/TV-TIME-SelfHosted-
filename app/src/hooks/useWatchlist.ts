import { useEffect, useState, useRef, useCallback } from "react";
import { onShowRemoved } from "../utils/watchlistEvents";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
} from "@react-native-firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TrackingItem, CatalogShow, CacheKey } from "../types";

const PAGE_SIZE = 50;

export interface EnrichedTrackingItem extends TrackingItem {
  title: string;
  posterPath: string | null;
  totalEpisodes: number;
  catalogShow: CatalogShow | null;
}

async function enrichItems(
  trackingItems: TrackingItem[],
  cache: Map<string, CatalogShow | null>,
): Promise<EnrichedTrackingItem[]> {
  const db = getFirestore();
  return Promise.all(
    trackingItems.map(async (item): Promise<EnrichedTrackingItem> => {
      const key = String(item.tmdbId);
      let catalogShow = cache.get(key);

      if (catalogShow === undefined) {
        try {
          const showDoc = await getDoc(doc(db, "shows", key));
          catalogShow = showDoc.exists()
            ? ({ id: showDoc.id, ...showDoc.data() } as unknown as CatalogShow)
            : null;
        } catch {
          catalogShow = null;
        }
        cache.set(key, catalogShow);
      }

      return {
        ...item,
        title: catalogShow?.title ?? `Show #${item.tmdbId}`,
        posterPath: catalogShow?.posterPath ?? null,
        totalEpisodes: catalogShow?.totalEpisodes ?? 0,
        catalogShow: catalogShow ?? null,
      };
    }),
  );
}

export function useWatchlist(userId: string | undefined) {
  const [items, setItems] = useState<EnrichedTrackingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const catalogCache = useRef<Map<string, CatalogShow | null>>(new Map());
  const paginationCursor = useRef<QueryDocumentSnapshot | null>(null);
  const firstPageLastDoc = useRef<QueryDocumentSnapshot | null>(null);
  const paginatedItems = useRef<EnrichedTrackingItem[]>([]);
  const restoredCache = useRef(false);

  // Restore cached watchlist on mount
  useEffect(() => {
    if (!userId || restoredCache.current) return;
    AsyncStorage.getItem(CacheKey.WATCHLIST_PROFILE).then((raw) => {
      if (!raw) return;
      try {
        const cached = JSON.parse(raw);
        if (cached.userId === userId && cached.items?.length > 0) {
          setItems(cached.items);
          // Don't set loading=false here — profile cache lacks catalogShow
          // WATCHLIST_ACTIVE cache handles display until Firestore enriches
        }
      } catch {}
      restoredCache.current = true;
    });
  }, [userId]);

  // First page with real-time listener
  useEffect(() => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      setHasMore(false);
      return;
    }

    const db = getFirestore();
    const colRef = collection(doc(db, "users", userId), "tracking");
    const q = query(colRef, orderBy("priorityDate", "desc"), limit(PAGE_SIZE));

    paginatedItems.current = [];
    paginationCursor.current = null;

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const trackingItems = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as TrackingItem[];

        const enriched = await enrichItems(trackingItems, catalogCache.current);

        // Set pagination cursor from first page only if no pagination has happened yet
        firstPageLastDoc.current =
          snapshot.docs[snapshot.docs.length - 1] || null;
        if (!paginationCursor.current) {
          paginationCursor.current = firstPageLastDoc.current;
        }

        // Merge: first page (live) + paginated pages
        const firstPageIds = new Set(enriched.map((e) => e.id));
        paginatedItems.current = paginatedItems.current.filter(
          (p) => !firstPageIds.has(p.id),
        );

        // If items were removed/modified, verify paginated items still exist
        const hasRemovals = snapshot
          .docChanges()
          .some((c) => c.type === "removed");
        if (hasRemovals && paginatedItems.current.length > 0) {
          const checks = paginatedItems.current.map((p) =>
            getDoc(doc(db, "users", userId!, "tracking", String(p.tmdbId))),
          );
          const results = await Promise.all(checks);
          paginatedItems.current = paginatedItems.current.filter((_, i) =>
            results[i].exists(),
          );
        }

        const merged = [...enriched, ...paginatedItems.current];
        setItems(merged);

        // Cache first page (strip catalogShow to keep payload small)
        const toCache = enriched.map(({ catalogShow, ...rest }) => rest);
        AsyncStorage.setItem(
          CacheKey.WATCHLIST_PROFILE,
          JSON.stringify({ userId, items: toCache }),
        ).catch(() => {});

        setHasMore(snapshot.docs.length >= PAGE_SIZE);
        setLoading(false);
      },
      (error) => {
        console.error("Tracking listener error:", error);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || loadingMore || !paginationCursor.current) return;
    setLoadingMore(true);

    try {
      const db = getFirestore();
      const colRef = collection(doc(db, "users", userId), "tracking");
      const q = query(
        colRef,
        orderBy("priorityDate", "desc"),
        startAfter(paginationCursor.current),
        limit(PAGE_SIZE),
      );

      const snapshot = await getDocs(q);
      if (snapshot.docs.length === 0) {
        setHasMore(false);
        return;
      }

      const trackingItems = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as TrackingItem[];

      const enriched = await enrichItems(trackingItems, catalogCache.current);

      // Update pagination cursor to last doc of this page
      paginationCursor.current = snapshot.docs[snapshot.docs.length - 1];

      // Append to paginated items ref
      const existingIds = new Set(paginatedItems.current.map((p) => p.id));
      const newItems = enriched.filter((e) => !existingIds.has(e.id));
      paginatedItems.current = [...paginatedItems.current, ...newItems];

      // Update state
      setItems((prev) => {
        const prevIds = new Set(prev.map((p) => p.id));
        const toAdd = newItems.filter((e) => !prevIds.has(e.id));
        return [...prev, ...toAdd];
      });

      setHasMore(snapshot.docs.length >= PAGE_SIZE);
    } catch (error) {
      console.error("Load more tracking error:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [userId, hasMore, loadingMore]);

  const removeItem = useCallback(
    (tmdbId: number) => {
      paginatedItems.current = paginatedItems.current.filter(
        (p) => p.tmdbId !== tmdbId,
      );
      catalogCache.current.delete(String(tmdbId));
      setItems((prev) => {
        const updated = prev.filter((p) => p.tmdbId !== tmdbId);
        // Update AsyncStorage cache
        if (userId) {
          const toCache = updated
            .slice(0, 50)
            .map(({ catalogShow, ...rest }) => rest);
          AsyncStorage.setItem(
            CacheKey.WATCHLIST_PROFILE,
            JSON.stringify({ userId, items: toCache }),
          ).catch(() => {});
        }
        return updated;
      });
    },
    [userId],
  );

  // Listen for external removal events (e.g. from ShowDetailScreen)
  useEffect(() => onShowRemoved(removeItem), [removeItem]);

  return { items, loading, loadMore, loadingMore, hasMore, removeItem };
}
