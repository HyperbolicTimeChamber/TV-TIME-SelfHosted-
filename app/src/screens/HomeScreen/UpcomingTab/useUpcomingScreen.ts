import { useCallback, useMemo, useRef, useState } from "react";
import { useAuthStore } from "../../../stores";
import { useUpcomingEpisodes } from "../../../hooks";
import { getCachedCatalogShow } from "../../../hooks/useWatchlist";
import { getCatalogShow, getShowDetails, getSeasonDetails } from "../../../services";
import { UpcomingEpisode, MediaType, ShowDrawerData, CarouselEpisode } from "../../../types";
import { todayStr } from "../../../utils";
import { sortByAirTime } from "../../../utils/airTime";

export type ListItem =
	{ type: "header"; date: string } | { type: "episode"; episode: UpcomingEpisode };

/**
 * Upcoming tab state + actions (past-days queue + upcoming list, episode modal,
 * show drawer). Shared by the mobile UpcomingTab and the web upcoming list.
 */
export function useUpcomingScreen(handleNavigateToShow: (tmdbShowId: number) => void) {
	const user = useAuthStore((s) => s.user);
	const { data: upcoming, pastData, isLoading, error, retry } = useUpcomingEpisodes(user?.uid);
	// Past days (local queue, oldest first) above today/future
	const episodes = useMemo(() => [...pastData, ...upcoming], [pastData, upcoming]);

	// Episode detail modal
	const [epModalVisible, setEpModalVisible] = useState(false);
	const [epModalData, setEpModalData] = useState<{
		tmdbId: number;
		showTitle: string;
		showPosterPath: string | null;
		showBackdropPath: string | null;
		episodes: CarouselEpisode[];
		initialIndex: number;
		watchedKeys: Map<string, number>;
		currentNextEpisode: null;
	} | null>(null);

	// Show drawer
	const [drawerVisible, setDrawerVisible] = useState(false);
	const [drawerShow, setDrawerShow] = useState<ShowDrawerData | null>(null);

	const listData = useMemo(() => {
		if (!episodes || episodes.length === 0) return [] as ListItem[];

		const grouped = new Map<string, UpcomingEpisode[]>();
		for (const ep of episodes) {
			const existing = grouped.get(ep.airDate) || [];
			existing.push(ep);
			grouped.set(ep.airDate, existing);
		}

		const result: ListItem[] = [];
		for (const [date, eps] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
			result.push({ type: "header", date });
			for (const ep of sortByAirTime(eps)) {
				result.push({ type: "episode", episode: ep });
			}
		}
		return result;
	}, [episodes]);

	// Open scrolled to today (past days sit above)
	const firstUpcomingIndex = useMemo(() => {
		const today = todayStr();
		const idx = listData.findIndex((i) => i.type === "header" && i.date >= today);
		return idx === -1 ? Math.max(0, listData.length - 1) : idx;
	}, [listData]);

	const epModalTmdbIdRef = useRef<number | null>(null);

	const handleEpisodePress = useCallback((ep: UpcomingEpisode) => {
		const catalog = getCachedCatalogShow(
			ep.tmdbShowId,
			ep.mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV,
		);

		const carouselEp: CarouselEpisode = {
			season: ep.season,
			episode: ep.episode,
			title: ep.episodeTitle,
			airDate: ep.airDate,
			runtime: ep.runtime,
			stillPath: null,
			overview: null,
		};

		epModalTmdbIdRef.current = ep.tmdbShowId;
		setEpModalData({
			tmdbId: ep.tmdbShowId,
			showTitle: ep.showTitle,
			showPosterPath: ep.posterPath ?? null,
			showBackdropPath: catalog?.backdropPath ?? null,
			episodes: [carouselEp],
			initialIndex: 0,
			watchedKeys: new Map(),
			currentNextEpisode: null,
		});
		setEpModalVisible(true);
	}, []);

	const handleLoadEpisodeDetails = useCallback(
		async (season: number): Promise<CarouselEpisode[] | null> => {
			const tmdbId = epModalTmdbIdRef.current;
			const apiKey = useAuthStore.getState().appTmdbApiKey;
			if (!apiKey || !tmdbId) return null;
			try {
				const seasonData = await getSeasonDetails(apiKey, tmdbId, season);
				return seasonData.episodes.map((e) => ({
					season: e.season_number ?? season,
					episode: e.episode_number,
					title: e.name || null,
					airDate: e.air_date || null,
					runtime: e.runtime || null,
					stillPath: e.still_path || null,
					overview: e.overview || null,
				}));
			} catch {
				const catalog = await getCatalogShow(tmdbId, MediaType.TV);
				const catSeason = catalog?.seasons?.find((s) => s.seasonNumber === season);
				if (catSeason) {
					return catSeason.episodes.map((e) => ({
						season: catSeason.seasonNumber,
						episode: e.episodeNumber,
						title: e.title || null,
						airDate: e.airDate || null,
						runtime: e.runtime || null,
						stillPath: e.stillPath || null,
						overview: e.overview || null,
					}));
				}
				return null;
			}
		},
		[],
	);

	const handleTitlePress = useCallback(async (ep: UpcomingEpisode) => {
		const catalog = await getCatalogShow(
			ep.tmdbShowId,
			ep.mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV,
		);
		if (catalog) {
			setDrawerShow({
				tmdbId: catalog.tmdbId,
				title: catalog.title,
				posterPath: catalog.posterPath,
				backdropPath: catalog.backdropPath,
				overview: catalog.overview || null,
				mediaType: catalog.mediaType,
				year: (catalog.firstAirDate || "")?.substring(0, 4) || null,
				totalSeasons: catalog.totalSeasons,
				totalEpisodes: catalog.totalEpisodes,
				runtime: catalog.runtime,
				voteAverage: catalog.voteAverage,
			});
			setDrawerVisible(true);

			const apiKey = useAuthStore.getState().appTmdbApiKey;
			if (apiKey) {
				try {
					const data = (await getShowDetails(apiKey, catalog.tmdbId, catalog.mediaType)) as any;
					const genres = data?.genres?.map((g: any) => g.name).join(", ");
					const overview = data?.overview || "";
					setDrawerShow((prev) =>
						prev
							? {
									...prev,
									...(genres && { genres }),
									overview: overview || prev.overview || "",
								}
							: null,
					);
				} catch {
					setDrawerShow((prev) => (prev ? { ...prev, overview: prev.overview || "" } : null));
				}
			} else {
				setDrawerShow((prev) => (prev ? { ...prev, overview: prev.overview || "" } : null));
			}
		}
	}, []);

	const handleEpModalShowPress = useCallback(() => {
		if (!epModalData || !epModalData.episodes[0]) return;
		setEpModalVisible(false);
		setEpModalData(null);
		handleNavigateToShow(epModalData.tmdbId);
	}, [epModalData, handleNavigateToShow]);

	return {
		user,
		episodes,
		epModalVisible,
		setEpModalVisible,
		epModalData,
		setEpModalData,
		drawerVisible,
		setDrawerVisible,
		drawerShow,
		setDrawerShow,
		listData,
		firstUpcomingIndex,
		epModalTmdbIdRef,
		handleEpisodePress,
		handleLoadEpisodeDetails,
		handleTitlePress,
		handleEpModalShowPress,
		upcoming,
		pastData,
		isLoading,
		error,
		retry,
	};
}
