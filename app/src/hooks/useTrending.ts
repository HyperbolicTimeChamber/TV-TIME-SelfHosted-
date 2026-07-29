import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTrending } from "../services";
import { TMDBShow, QueryKey, CacheKey } from "../types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function cacheKey(mediaType: string) {
	return `${CacheKey.TRENDING_CACHE}_${mediaType}`;
}

export function useTrending(mediaType: string = "tv") {
	const queryClient = useQueryClient();
	const restored = useRef(false);

	// Restore from AsyncStorage on mount (once)
	useEffect(() => {
		if (restored.current) return;
		restored.current = true;
		AsyncStorage.getItem(cacheKey(mediaType))
			.then((raw) => {
				if (!raw) return;
				const cached = JSON.parse(raw);
				if (Date.now() - cached.ts < WEEK_MS) {
					queryClient.setQueryData([QueryKey.TRENDING, mediaType], cached.data);
				}
			})
			.catch(() => {});
	}, [mediaType, queryClient]);

	const query = useQuery({
		queryKey: [QueryKey.TRENDING, mediaType],
		queryFn: () => getTrending(mediaType),
		staleTime: WEEK_MS,
		select: (data) => data.results as unknown as TMDBShow[],
	});

	// Persist to AsyncStorage when fresh data arrives
	useEffect(() => {
		if (!query.data || query.isStale) return;
		const raw = queryClient.getQueryData([QueryKey.TRENDING, mediaType]);
		if (!raw) return;
		AsyncStorage.setItem(
			cacheKey(mediaType),
			JSON.stringify({ ts: Date.now(), data: raw }),
		).catch(() => {});
	}, [query.data, query.isStale, mediaType, queryClient]);

	return query;
}
