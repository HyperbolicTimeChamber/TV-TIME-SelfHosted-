import { useEffect, useState, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CacheKey, MediaType } from "../types";
import { EnrichedTrackingItem } from "./useWatchlist";

export interface ProfileCardImages {
	episodeBackdrop: string | null;
	movieBackdrop: string | null;
	trackingPosters: string[];
	watchTimePosters: string[];
}

const COLLAGE_COUNT = 16;

function pickRandom<T>(arr: T[], count: number, allowRepeat = false): T[] {
	if (arr.length === 0) return [];
	if (allowRepeat) {
		const tiled: T[] = [];
		while (tiled.length < count) tiled.push(...arr);
		return tiled.sort(() => Math.random() - 0.5).slice(0, count);
	}
	return [...arr].sort(() => Math.random() - 0.5).slice(0, count);
}

function getBackdrop(item: EnrichedTrackingItem): string | null {
	return item.catalogShow?.backdropPath ?? null;
}

export function useProfileCardImages(watchlist: EnrichedTrackingItem[]) {
	const [images, setImages] = useState<ProfileCardImages>({
		episodeBackdrop: null,
		movieBackdrop: null,
		trackingPosters: [],
		watchTimePosters: [],
	});
	const restoredCache = useRef(false);

	useEffect(() => {
		if (restoredCache.current) return;
		AsyncStorage.getItem(CacheKey.PROFILE_CARD_IMAGES).then((raw) => {
			if (raw) {
				try {
					const parsed = JSON.parse(raw);
					setImages({
						episodeBackdrop: parsed.episodeBackdrop ?? null,
						movieBackdrop: parsed.movieBackdrop ?? null,
						trackingPosters: parsed.trackingPosters ?? [],
						watchTimePosters: parsed.watchTimePosters ?? [],
					});
				} catch {}
			}
			restoredCache.current = true;
		});
	}, []);

	useEffect(() => {
		if (watchlist.length === 0) return;

		const tvShows = watchlist.filter((w) => w.mediaType === MediaType.TV && getBackdrop(w));
		const movies = watchlist.filter((w) => w.mediaType === MediaType.MOVIE && getBackdrop(w));
		const allWithPosters = watchlist.filter((w) => w.posterPath);

		const latestTV = [...tvShows].sort((a, b) => {
			const aTime = a.lastWatchedAt?.toMillis?.() ?? 0;
			const bTime = b.lastWatchedAt?.toMillis?.() ?? 0;
			return bTime - aTime;
		})[0];

		const latestMovie = [...movies].sort((a, b) => {
			const aTime = a.lastWatchedAt?.toMillis?.() ?? 0;
			const bTime = b.lastWatchedAt?.toMillis?.() ?? 0;
			return bTime - aTime;
		})[0];

		const allPosterPaths = allWithPosters.map((w) => w.posterPath!);
		const useScatter = allPosterPaths.length >= 10;
		const trackingPosters = pickRandom(allPosterPaths, COLLAGE_COUNT, useScatter);
		const watchTimePosters = pickRandom(allPosterPaths, COLLAGE_COUNT, useScatter);

		const updated: ProfileCardImages = {
			episodeBackdrop: getBackdrop(latestTV) ?? null,
			movieBackdrop: getBackdrop(latestMovie) ?? null,
			trackingPosters,
			watchTimePosters,
		};

		setImages(updated);
		AsyncStorage.setItem(CacheKey.PROFILE_CARD_IMAGES, JSON.stringify(updated)).catch(() => {});
	}, [watchlist]);

	return images;
}
