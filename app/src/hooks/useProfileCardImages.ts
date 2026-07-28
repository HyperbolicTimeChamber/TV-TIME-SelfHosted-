import { useEffect, useState, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CacheKey, MediaType } from "../types";
import { EnrichedTrackingItem } from "./useWatchlist";

export interface ProfileCardImages {
	episodeBackdrop: string | null;
	movieBackdrop: string | null;
	trackingBackdrops: string[];
	watchTimeBackdrops: string[];
}

const COLLAGE_COUNT = 4;

function pickRandom<T>(arr: T[], count: number): T[] {
	const shuffled = [...arr].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, count);
}

function getBackdrop(item: EnrichedTrackingItem): string | null {
	return item.catalogShow?.backdropPath ?? null;
}

export function useProfileCardImages(watchlist: EnrichedTrackingItem[]) {
	const [images, setImages] = useState<ProfileCardImages>({
		episodeBackdrop: null,
		movieBackdrop: null,
		trackingBackdrops: [],
		watchTimeBackdrops: [],
	});
	const restoredCache = useRef(false);

	// Restore cache on mount
	useEffect(() => {
		if (restoredCache.current) return;
		AsyncStorage.getItem(CacheKey.PROFILE_CARD_IMAGES).then((raw) => {
			if (raw) {
				try {
					const parsed = JSON.parse(raw);
					setImages({
						episodeBackdrop: parsed.episodeBackdrop ?? null,
						movieBackdrop: parsed.movieBackdrop ?? null,
						trackingBackdrops: parsed.trackingBackdrops ?? [],
						watchTimeBackdrops: parsed.watchTimeBackdrops ?? [],
					});
				} catch {}
			}
			restoredCache.current = true;
		});
	}, []);

	// Update when watchlist data arrives
	useEffect(() => {
		if (watchlist.length === 0) return;

		const tvShows = watchlist.filter(
			(w) => w.mediaType === MediaType.TV && getBackdrop(w),
		);
		const movies = watchlist.filter(
			(w) => w.mediaType === MediaType.MOVIE && getBackdrop(w),
		);
		const allWithBackdrops = watchlist.filter((w) => getBackdrop(w));

		// Latest watched TV show (sorted by lastWatchedAt desc)
		const latestTV = [...tvShows].sort((a, b) => {
			const aTime = a.lastWatchedAt?.toMillis?.() ?? 0;
			const bTime = b.lastWatchedAt?.toMillis?.() ?? 0;
			return bTime - aTime;
		})[0];

		// Latest watched movie
		const latestMovie = [...movies].sort((a, b) => {
			const aTime = a.lastWatchedAt?.toMillis?.() ?? 0;
			const bTime = b.lastWatchedAt?.toMillis?.() ?? 0;
			return bTime - aTime;
		})[0];

		// Two separate random sets for tracking vs watch time
		const allPaths = allWithBackdrops.map((w) => getBackdrop(w)!);
		const trackingBackdrops = pickRandom(allPaths, COLLAGE_COUNT);
		const watchTimeBackdrops = pickRandom(allPaths, COLLAGE_COUNT);

		const updated: ProfileCardImages = {
			episodeBackdrop: getBackdrop(latestTV) ?? null,
			movieBackdrop: getBackdrop(latestMovie) ?? null,
			trackingBackdrops,
			watchTimeBackdrops,
		};

		setImages(updated);
		AsyncStorage.setItem(CacheKey.PROFILE_CARD_IMAGES, JSON.stringify(updated)).catch(() => {});
	}, [watchlist]);

	return images;
}
