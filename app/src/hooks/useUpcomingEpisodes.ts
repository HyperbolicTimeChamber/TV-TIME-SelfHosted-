import { useEffect, useState, useCallback, useRef } from "react";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "@react-native-firebase/firestore";
import { UpcomingEpisode, CatalogShow } from "../types";

const INITIAL_DAYS = 5;
const PAGE_DAYS = 5;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchEpisodesInRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<UpcomingEpisode[]> {
  const db = getFirestore();
  const trackingCol = collection(doc(db, "users", userId), "tracking");
  const snap = await getDocs(
    query(trackingCol, where("mediaType", "==", "tv"))
  );

  const activeStatuses = ["watching", "rewatching"];
  const tvShows = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((t: any) => activeStatuses.includes(t.status));

  const episodes: UpcomingEpisode[] = [];

  for (const show of tvShows) {
    try {
      const showDoc = await getDoc(doc(db, "shows", show.id));
      if (!showDoc.exists()) continue;
      const catalog = showDoc.data() as CatalogShow;

      for (const season of catalog.seasons || []) {
        if (season.seasonNumber === 0) continue;
        for (const ep of season.episodes || []) {
          if (!ep.airDate) continue;
          if (ep.airDate >= startDate && ep.airDate <= endDate) {
            episodes.push({
              tmdbShowId: catalog.tmdbId ?? Number(show.id),
              showTitle: catalog.title ?? `Show #${show.id}`,
              posterPath: catalog.posterPath ?? null,
              season: season.seasonNumber,
              episode: ep.episodeNumber,
              episodeTitle: ep.title,
              airDate: ep.airDate,
              runtime: ep.runtime ?? null,
            });
          }
        }
      }
    } catch {
      // Skip
    }
  }

  return episodes.sort((a, b) => a.airDate.localeCompare(b.airDate));
}

export function useUpcomingEpisodes(userId: string | undefined) {
  const [data, setData] = useState<UpcomingEpisode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string>(""); // end date of last fetched range
  const today = useRef(new Date().toISOString().slice(0, 10));

  // Initial load: today + 5 days
  useEffect(() => {
    if (!userId) {
      setData([]);
      setIsLoading(false);
      setHasMore(false);
      return;
    }

    let cancelled = false;
    const endDate = addDays(today.current, INITIAL_DAYS);

    fetchEpisodesInRange(userId, today.current, endDate).then((eps) => {
      if (cancelled) return;
      setData(eps);
      cursorRef.current = endDate;
      setIsLoading(false);
      setHasMore(true);
    });

    return () => { cancelled = true; };
  }, [userId]);

  // Load more: next PAGE_DAYS chunk
  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || loadingMore) return;
    setLoadingMore(true);

    const startDate = addDays(cursorRef.current, 1);
    const endDate = addDays(startDate, PAGE_DAYS);

    try {
      const eps = await fetchEpisodesInRange(userId, startDate, endDate);
      cursorRef.current = endDate;

      const dedup = (prev: UpcomingEpisode[], next: UpcomingEpisode[]) => {
        const seen = new Set(prev.map((e) => `${e.tmdbShowId}_S${e.season}E${e.episode}`));
        return [...prev, ...next.filter((e) => !seen.has(`${e.tmdbShowId}_S${e.season}E${e.episode}`))];
      };

      if (eps.length === 0) {
        const farEnd = addDays(endDate, 90);
        const farEps = await fetchEpisodesInRange(userId, addDays(endDate, 1), farEnd);
        if (farEps.length === 0) {
          setHasMore(false);
        } else {
          setData((prev) => dedup(prev, farEps));
          cursorRef.current = farEnd;
        }
      } else {
        setData((prev) => dedup(prev, eps));
      }
    } finally {
      setLoadingMore(false);
    }
  }, [userId, hasMore, loadingMore]);

  return { data, isLoading, loadMore, loadingMore, hasMore };
}
