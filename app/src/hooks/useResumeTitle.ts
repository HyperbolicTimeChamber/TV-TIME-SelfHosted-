import { useCallback, useState } from "react";
import { MediaType, WatchStatus } from "../enums";
import type { HistoryEntry, UpcomingEpisode } from "../types";
import { useAuthStore } from "../stores";
import { resumeRewatch, resumeWatching } from "../services/firestore";
import { emitShowAdded, todayStr } from "../utils";
import { buildOptimisticItem } from "../screens/SearchScreen/helpers";
import { getCachedCatalogShow } from "./useWatchlist";
import { useUpcomingMutations } from "./useUpcomingEpisodes";
import { addMovieToCalendarGlobal } from "./useCalendarEpisodes";

/** Paused / paused rewatch — a list card offers Resume for these */
export function isPausedStatus(status: WatchStatus | undefined) {
	return status === WatchStatus.PAUSED || status === WatchStatus.PAUSED_REWATCH;
}

/**
 * Resume a paused title away from its page (a list card): the tracking doc back to watching /
 * rewatching, then the watchlist, upcoming and calendar caches put back locally (no refetch) —
 * what the info page's Resume does, from the cached catalog instead of the page's episode list.
 */
export function useResumeTitle() {
	const userId = useAuthStore((s) => s.user?.uid);
	const { addShowToUpcoming } = useUpcomingMutations();
	const [resuming, setResuming] = useState(false);

	const resume = useCallback(
		async (entry: HistoryEntry, title: string, posterPath: string | null) => {
			if (!userId || resuming || !isPausedStatus(entry.status)) return;
			const rewatch = entry.status === WatchStatus.PAUSED_REWATCH;
			setResuming(true);
			try {
				await (rewatch ? resumeRewatch : resumeWatching)(userId, entry.tmdbId, entry.mediaType);
				const catalog = getCachedCatalogShow(entry.tmdbId, entry.mediaType);
				const next = entry.nextEpisode;
				const nextEp = next
					? catalog?.seasons
							?.find((s) => s.seasonNumber === next.season)
							?.episodes?.find((e) => e.episodeNumber === next.episode)
					: undefined;
				// Pause took the show off the local watchlist + upcoming; put it back
				emitShowAdded({
					...buildOptimisticItem(
						entry.tmdbId,
						entry.mediaType,
						title,
						posterPath,
						next,
						nextEp?.title ?? null,
						nextEp?.airDate ?? null,
						catalog,
					),
					status: rewatch ? WatchStatus.REWATCHING : WatchStatus.WATCHING,
					rewatchCount: entry.rewatchCount,
				});
				if (entry.mediaType !== MediaType.TV || !catalog) return;
				const today = todayStr();
				const upcoming: UpcomingEpisode[] = (catalog.seasons ?? [])
					.filter((s) => s.seasonNumber > 0)
					.flatMap((s) =>
						(s.episodes ?? [])
							.filter((e) => !!e.airDate && e.airDate >= today)
							.map((e) => ({
								tmdbShowId: entry.tmdbId,
								showTitle: title,
								posterPath,
								season: s.seasonNumber,
								episode: e.episodeNumber,
								episodeTitle: e.title || "",
								airDate: e.airDate as string,
								runtime: e.runtime ?? null,
								mediaType: MediaType.TV,
								...(e.airStamp ? { airStamp: e.airStamp } : {}),
							})),
					);
				// Nothing cached to come → the addShow call resume makes rebuilds upcoming server-side
				if (upcoming.length === 0) return;
				addShowToUpcoming(entry.tmdbId, upcoming);
				for (const ep of upcoming) addMovieToCalendarGlobal(ep);
			} catch (err) {
				console.error("[resume] failed:", err);
			} finally {
				setResuming(false);
			}
		},
		[userId, resuming, addShowToUpcoming],
	);

	return { resume, resuming };
}
