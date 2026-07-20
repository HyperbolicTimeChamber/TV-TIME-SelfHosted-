import { useEffect, useState, useRef, useCallback } from "react";
import { onShowRemoved } from "../utils/watchlistEvents";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
import { TrackingItem, CatalogShow, CacheKey, DocChangeType } from "../types";
import { showDocId } from "../utils/docId";

const PAGE_SIZE = 50;

export interface EnrichedTrackingItem extends TrackingItem {
  title: string;
  posterPath: string | null;
  totalEpisodes: number;
  catalogShow: CatalogShow | null;
}

/** Persist catalog cache to AsyncStorage */
function persistCatalogCache(cache: Map<string, CatalogShow | null>) {
  const obj: Record<string, CatalogShow | null> = {};
  for (const [key, val] of cache) obj[key] = val;
  AsyncStorage.setItem(CacheKey.CATALOG_CACHE, JSON.stringify(obj)).catch(
    () => {},
  );
}

/** Restore catalog cache from AsyncStorage */
async function restoreCatalogCache(): Promise<Map<string, CatalogShow | null>> {
  try {
    const raw = await AsyncStorage.getItem(CacheKey.CATALOG_CACHE);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, CatalogShow | null>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

async function enrichItems(
  trackingItems: TrackingItem[],
  cache: Map<string, CatalogShow | null>,
): Promise<EnrichedTrackingItem[]> {
  const db = getFirestore();
  let cacheUpdated = false;
  const enriched = await Promise.all(
    trackingItems.map(async (item): Promise<EnrichedTrackingItem> => {
      const mt = (item as any).mediaType === "movie" ? "movie" : "tv";
      const key = showDocId(item.tmdbId, mt);
      let catalogShow = cache.get(key);

      if (catalogShow === undefined) {
        try {
          const showDoc = await getDoc(doc(db, "shows", key));
          catalogShow = showDoc?.exists?.()
            ? ({ id: showDoc.id, ...showDoc.data() } as unknown as CatalogShow)
            : null;
        } catch {
          catalogShow = null;
        }
        cache.set(key, catalogShow);
        cacheUpdated = true;
      }

      return {
        ...item,
        title:
          catalogShow?.title ?? (item as any).title ?? `Show #${item.tmdbId}`,
        posterPath: catalogShow?.posterPath ?? (item as any).posterPath ?? null,
        totalEpisodes: catalogShow?.totalEpisodes ?? 0,
        catalogShow: catalogShow ?? null,
      };
    }),
  );

  if (cacheUpdated) persistCatalogCache(cache);
  return enriched;
}

export function useWatchlist(userId: string | undefined) {
  const [items, setItems] = useState<EnrichedTrackingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const catalogCache = useRef<Map<string, CatalogShow | null>>(new Map());
  const catalogCacheRestored = useRef(false);
  const paginationCursor = useRef<QueryDocumentSnapshot | null>(null);
  const firstPageLastDoc = useRef<QueryDocumentSnapshot | null>(null);
  const paginatedItems = useRef<EnrichedTrackingItem[]>([]);
  // Queue snapshots received before catalog cache is restored
  const pendingSnapshot = useRef<any>(null);

  // Restore persisted catalog cache on mount
  useEffect(() => {
    restoreCatalogCache().then((restored) => {
      if (restored.size > 0) {
        catalogCache.current = restored;
      }
      catalogCacheRestored.current = true;
      // Process any snapshot that arrived while restoring
      if (pendingSnapshot.current) {
        pendingSnapshot.current();
        pendingSnapshot.current = null;
      }
    });
  }, []);

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

    let prevEnrichedMap = new Map<string, EnrichedTrackingItem>();

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        // Wait for catalog cache restoration before processing
        if (!catalogCacheRestored.current) {
          pendingSnapshot.current = () => processSnapshot(snapshot);
          return;
        }
        await processSnapshot(snapshot);
      },
      (error) => {
        console.error("Tracking listener error:", error);
        setLoading(false);
      },
    );

    async function processSnapshot(snapshot: any) {
      const trackingItems = snapshot.docs.map((d: any) => ({
        id: d.id,
        ...d.data(),
      })) as TrackingItem[];

      // Only enrich changed/added items — reuse previous for unchanged
      const changedIds = new Set(
        snapshot.docChanges().map((c: any) => c.doc.id),
      );
      const isInitial = prevEnrichedMap.size === 0;

      let enriched: EnrichedTrackingItem[];
      if (isInitial || changedIds.size === trackingItems.length) {
        // Initial load or full refresh
        enriched = await enrichItems(trackingItems, catalogCache.current);
      } else {
        // Incremental: only enrich changed items
        const toEnrich = trackingItems.filter((t) => changedIds.has(t.id));
        const freshlyEnriched = await enrichItems(
          toEnrich,
          catalogCache.current,
        );
        const freshMap = new Map(freshlyEnriched.map((e) => [e.id, e]));

        enriched = trackingItems.map(
          (t) =>
            freshMap.get(t.id) ??
            prevEnrichedMap.get(t.id) ?? {
              ...t,
              title: `Show #${t.tmdbId}`,
              posterPath: null,
              totalEpisodes: 0,
              catalogShow: null,
            },
        );
      }

      // Update prev map for next snapshot
      prevEnrichedMap = new Map(enriched.map((e) => [e.id, e]));

      firstPageLastDoc.current =
        snapshot.docs[snapshot.docs.length - 1] || null;
      if (!paginationCursor.current) {
        paginationCursor.current = firstPageLastDoc.current;
      }

      const firstPageIds = new Set(enriched.map((e) => e.id));
      paginatedItems.current = paginatedItems.current.filter(
        (p) => !firstPageIds.has(p.id),
      );

      const hasRemovals = snapshot
        .docChanges()
        .some((c: any) => c.type === DocChangeType.REMOVED);
      if (hasRemovals && paginatedItems.current.length > 0 && userId) {
        try {
          const checks = paginatedItems.current.map((p) =>
            getDoc(
              doc(
                db,
                "users",
                userId!,
                "tracking",
                showDocId(
                  p.tmdbId,
                  (p as any).mediaType === "movie" ? "movie" : "tv",
                ),
              ),
            ),
          );
          const results = await Promise.all(checks);
          paginatedItems.current = paginatedItems.current.filter(
            (_, i) => results[i]?.exists?.() ?? false,
          );
        } catch {}
      }

      const merged = [...enriched, ...paginatedItems.current];
      setItems(merged);
      setHasMore(snapshot.docs.length >= PAGE_SIZE);
      setLoading(false);
    }

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

      paginationCursor.current = snapshot.docs[snapshot.docs.length - 1];

      const existingIds = new Set(paginatedItems.current.map((p) => p.id));
      const newItems = enriched.filter((e) => !existingIds.has(e.id));
      paginatedItems.current = [...paginatedItems.current, ...newItems];

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

  const removeItem = useCallback((tmdbId: number) => {
    paginatedItems.current = paginatedItems.current.filter(
      (p) => p.tmdbId !== tmdbId,
    );
    catalogCache.current.delete(showDocId(tmdbId, "tv"));
    catalogCache.current.delete(showDocId(tmdbId, "movie"));
    setItems((prev) => prev.filter((p) => p.tmdbId !== tmdbId));
  }, []);

  // Listen for external removal events (e.g. from ShowDetailScreen)
  useEffect(() => onShowRemoved(removeItem), [removeItem]);

  return { items, loading, loadMore, loadingMore, hasMore, removeItem };
}
