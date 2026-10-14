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
import {
	onShowCompleted,
	showDocId,
	buildCompletedSections as buildSections,
	type CompletedItem,
	type CompletedSection,
} from "../utils";

export type { CompletedItem, CompletedSection };

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
				// Already listed (e.g. a completed movie watched again) → replace, don't duplicate
				const allItems = extractAllItems(prev).filter(
					(i) => !(i.tmdbId === item.tmdbId && i.mediaType === item.mediaType),
				);
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
	// TV shows and movies can share a TMDB id — key by both
	const seen = new Set<string>();
	const items: CompletedItem[] = [];
	for (const section of sections) {
		for (const item of section.items) {
			const key = `${item.mediaType}_${item.tmdbId}`;
			if (!seen.has(key)) {
				seen.add(key);
				items.push(item);
			}
		}
	}
	return items;
}
