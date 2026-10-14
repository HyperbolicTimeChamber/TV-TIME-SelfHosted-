import { useEffect, useState, useRef, useCallback } from "react";
import {
	getFirestore,
	collection,
	doc,
	query,
	where,
	getDocs,
} from "@react-native-firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CacheKey, WatchStatus, MediaType } from "../types";
import { cacheCatalogShows, getCachedCatalogShow } from "./useWatchlist";
import { fetchCatalogShows } from "../services/historyApi";
import { onShowCompleted, showDocId } from "../utils";

export interface CompletedItem {
	tmdbId: number;
	mediaType: MediaType;
	title: string;
	posterPath: string | null;
	genres: string[];
	completedAt: number;
}

export interface CompletedSection {
	title: string;
	items: CompletedItem[];
}

const SECTION_LIMIT = 10;
/** Most recently completed TV shows considered for the genre rows — enough to fill them */
const RECENT_TV_POOL = 60;

/**
 * Completed tracking docs → display items. Only what can be shown is kept (latest
 * movies + latest TV shows); catalogs missing from the shared cache are fetched in one
 * batched query and cached, so later loads read nothing. Before, missing catalogs
 * rendered as "Show 12345" with no poster under "Other".
 */
async function loadCompletedItems(userId: string): Promise<CompletedItem[]> {
	const db = getFirestore();
	const snap = await getDocs(
		query(collection(doc(db, "users", userId), "tracking"), where("status", "==", WatchStatus.COMPLETED)),
	);
	const docs = snap.docs
		.map((d) => {
			const data = d.data();
			return {
				tmdbId: data.tmdbId as number,
				mediaType: (data.mediaType as MediaType) ?? MediaType.TV,
				completedAt: (data.lastWatchedAt?.toMillis?.() as number | undefined) ?? 0,
			};
		})
		.sort((a, b) => b.completedAt - a.completedAt);
	const shown = [
		...docs.filter((d) => d.mediaType === MediaType.MOVIE).slice(0, SECTION_LIMIT),
		...docs.filter((d) => d.mediaType === MediaType.TV).slice(0, RECENT_TV_POOL),
	];

	const missing = shown
		.filter((d) => !getCachedCatalogShow(d.tmdbId, d.mediaType))
		.map((d) => showDocId(d.tmdbId, d.mediaType));
	if (missing.length > 0) {
		cacheCatalogShows(await fetchCatalogShows(missing).catch(() => []));
	}

	return shown.map((d) => {
		const catalog = getCachedCatalogShow(d.tmdbId, d.mediaType);
		return {
			...d,
			title: catalog?.title ?? `Show ${d.tmdbId}`,
			posterPath: catalog?.posterPath ?? null,
			genres: catalog?.genres ?? [],
		};
	});
}

function buildSections(items: CompletedItem[]): CompletedSection[] {
	const sections: CompletedSection[] = [];

	// Movies
	const movies = items
		.filter((i) => i.mediaType === MediaType.MOVIE)
		.sort((a, b) => b.completedAt - a.completedAt)
		.slice(0, SECTION_LIMIT);
	if (movies.length > 0) {
		sections.push({ title: "Movies", items: movies });
	}

	// TV shows — group by genre if available, else single "TV Shows" section
	const tvShows = items.filter((i) => i.mediaType === MediaType.TV);
	const hasGenres = tvShows.some((s) => s.genres.length > 0);

	if (!hasGenres) {
		// No genres yet — simple TV Shows section
		const sorted = tvShows.sort((a, b) => b.completedAt - a.completedAt).slice(0, SECTION_LIMIT);
		if (sorted.length > 0) {
			sections.push({ title: "TV Shows", items: sorted });
		}
	} else {
		const genreMap = new Map<string, CompletedItem[]>();
		const placed = new Set<number>();
		for (const show of tvShows) {
			const genres = show.genres.length > 0 ? show.genres : ["Other"];
			// Only place each show in its first genre to avoid duplicates
			for (const genre of genres) {
				if (placed.has(show.tmdbId)) break;
				const list = genreMap.get(genre) ?? [];
				list.push(show);
				genreMap.set(genre, list);
				placed.add(show.tmdbId);
			}
		}

		const sortedGenres = [...genreMap.entries()].sort((a, b) => {
			if (a[0] === "Other") return 1;
			if (b[0] === "Other") return -1;
			return b[1].length - a[1].length || a[0].localeCompare(b[0]);
		});

		for (const [genre, shows] of sortedGenres) {
			const sorted = shows.sort((a, b) => b.completedAt - a.completedAt).slice(0, SECTION_LIMIT);
			sections.push({ title: genre, items: sorted });
		}
	}

	return sections;
}

export function useCompletedShows(userId: string | undefined) {
	const [sections, setSections] = useState<CompletedSection[]>([]);
	const [loading, setLoading] = useState(true);
	const restoredCache = useRef(false);
	const fetchedFromFirestore = useRef(false);

	// Restore cache
	useEffect(() => {
		if (!userId || restoredCache.current) return;
		AsyncStorage.getItem(CacheKey.COMPLETED_SECTIONS).then((raw) => {
			if (raw) {
				try {
					const parsed = JSON.parse(raw);
					if (parsed.userId === userId && parsed.items) {
						setSections(buildSections(parsed.items));
						setLoading(false);
					}
				} catch {}
			}
			restoredCache.current = true;
		});
	}, [userId]);

	// Fetch from Firestore
	useEffect(() => {
		if (!userId || fetchedFromFirestore.current) return;
		fetchedFromFirestore.current = true;

		(async () => {
			const items = await loadCompletedItems(userId);
			setSections(buildSections(items));
			setLoading(false);

			AsyncStorage.setItem(CacheKey.COMPLETED_SECTIONS, JSON.stringify({ userId, items })).catch(
				() => {},
			);
		})();
	}, [userId]);

	const addCompletedItem = useCallback(
		(item: CompletedItem) => {
			setSections((prev) => {
				const allItems = extractAllItems(prev);
				allItems.push(item);
				const updated = buildSections(allItems);

				if (userId) {
					AsyncStorage.setItem(
						CacheKey.COMPLETED_SECTIONS,
						JSON.stringify({ userId, items: allItems }),
					).catch(() => {});
				}

				return updated;
			});
		},
		[userId],
	);

	// Listen for live completed events
	useEffect(() => {
		return onShowCompleted((event) => {
			addCompletedItem({
				tmdbId: event.tmdbId,
				mediaType: event.mediaType as MediaType,
				title: event.title,
				posterPath: event.posterPath,
				genres: event.genres,
				completedAt: Date.now(),
			});
		});
	}, [addCompletedItem]);

	const refetch = useCallback(async () => {
		if (!userId) return;
		const items = await loadCompletedItems(userId);

		setSections(buildSections(items));

		AsyncStorage.setItem(CacheKey.COMPLETED_SECTIONS, JSON.stringify({ userId, items })).catch(
			() => {},
		);
	}, [userId]);

	return { sections, loading, addCompletedItem, refetch };
}

function extractAllItems(sections: CompletedSection[]): CompletedItem[] {
	const seen = new Set<number>();
	const items: CompletedItem[] = [];
	for (const section of sections) {
		for (const item of section.items) {
			if (!seen.has(item.tmdbId)) {
				seen.add(item.tmdbId);
				items.push(item);
			}
		}
	}
	return items;
}
