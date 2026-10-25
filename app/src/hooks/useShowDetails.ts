import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getShowDetails, getCatalogShow } from "../services";
import { pickTitleLogo } from "../services/tmdb";
import { getCachedCatalogShow } from "./useWatchlist";
import { useAuthStore } from "../stores";
import { TMDBShow, TMDBEpisode, CatalogShow, QueryKey, MediaType } from "../types";
import { TMDB_PROXY_KEY } from "../enums";

export interface ShowDetailsResult {
	show: TMDBShow;
	episodesBySeason: Map<number, TMDBEpisode[]>;
}

function catalogShowToResult(catalog: CatalogShow): ShowDetailsResult {
	const episodesBySeason = new Map<number, TMDBEpisode[]>();
	const seasons = catalog.seasons ?? [];

	const show: TMDBShow = {
		id: catalog.tmdbId,
		name: catalog.mediaType === "tv" ? catalog.title : undefined,
		title: catalog.mediaType === "movie" ? catalog.title : undefined,
		poster_path: catalog.posterPath,
		backdrop_path: catalog.backdropPath,
		overview: catalog.overview,
		vote_average: catalog.voteAverage,
		first_air_date: catalog.firstAirDate ?? undefined,
		release_date: catalog.releaseDate ?? undefined,
		media_type: catalog.mediaType,
		genre_ids: [],
		number_of_seasons: catalog.totalSeasons,
		number_of_episodes: catalog.totalEpisodes,
		status: catalog.status,
		runtime: catalog.runtime ?? undefined,
		credits: catalog.credits
			? {
					crew: [
						...catalog.credits.directors.map((name) => ({
							job: "Director",
							department: "Directing",
							name,
						})),
						...catalog.credits.writers.map((name) => ({
							job: "Writer",
							department: "Writing",
							name,
						})),
						...catalog.credits.producers.map((name) => ({
							job: "Producer",
							department: "Production",
							name,
						})),
					],
				}
			: undefined,
		seasons: seasons.map((s) => ({
			id: 0,
			season_number: s.seasonNumber,
			name: `Season ${s.seasonNumber}`,
			episode_count: s.episodeCount,
			air_date: s.airDate,
			poster_path: catalog.posterPath,
		})),
	};

	for (const s of seasons) {
		episodesBySeason.set(
			s.seasonNumber,
			s.episodes.map((ep) => ({
				id: 0,
				episode_number: ep.episodeNumber,
				season_number: s.seasonNumber,
				name: ep.title,
				overview: ep.overview ?? "",
				air_date: ep.airDate,
				runtime: ep.runtime,
				still_path: ep.stillPath ?? null,
			})),
		);
	}

	return { show, episodesBySeason };
}

export function useShowDetails(tmdbId: number, mediaType: MediaType = MediaType.TV) {
	const queryClient = useQueryClient();
	const queryKey = [QueryKey.SHOW, tmdbId, mediaType];

	/** Catalog has no movie credits → render now, patch them in from TMDB when they land */
	const patchCreditsLater = (pending: Promise<TMDBShow> | null) => {
		pending
			?.then((tmdbShow) => {
				if (!tmdbShow.credits) return;
				// Next tick: the request may already be done, and the query only stores its
				// result after queryFn resolves — patching before that would be a no-op
				setTimeout(() =>
					queryClient.setQueryData<ShowDetailsResult>(queryKey, (old) =>
						old ? { ...old, show: { ...old.show, credits: tmdbShow.credits } } : old,
					),
				);
			})
			.catch(() => {});
	};

	const result = useQuery({
		queryKey,
		// Broken deep links arrive as id 0 → straight to the not-found page
		enabled: Number.isInteger(tmdbId) && tmdbId > 0,
		queryFn: async (): Promise<ShowDetailsResult> => {
			// Partial/untitled catalogs (search stand-ins) render a blank screen — skip them
			const hasSeasonsData = (c: CatalogShow) =>
				!c.partial && !!c.title && (mediaType !== MediaType.TV || (c.seasons?.length ?? 0) > 0);
			const apiKey = useAuthStore.getState().appTmdbApiKey;

			// Try in-memory cache first (instant, no Firestore read)
			const cached = getCachedCatalogShow(tmdbId, mediaType);
			if (cached && hasSeasonsData(cached)) {
				if (mediaType === MediaType.MOVIE && !cached.credits && apiKey) {
					patchCreditsLater(getShowDetails(apiKey, tmdbId, mediaType));
				}
				return catalogShowToResult(cached);
			}

			// Catalog doc + TMDB in parallel — a catalog miss no longer waits out a Firestore
			// round trip before TMDB even starts. Logged-out web visitors skip the catalog
			// (rules require auth) and go straight to TMDB via the proxy
			const isGuest = apiKey === TMDB_PROXY_KEY;
			const tmdbRequest = apiKey ? getShowDetails(apiKey, tmdbId, mediaType) : null;
			tmdbRequest?.catch(() => {});
			const catalogShow = isGuest
				? null
				: await getCatalogShow(tmdbId, mediaType).catch(() => null);
			if (catalogShow && hasSeasonsData(catalogShow)) {
				if (mediaType === MediaType.MOVIE && !catalogShow.credits) patchCreditsLater(tmdbRequest);
				return catalogShowToResult(catalogShow);
			}

			// Fallback to TMDB
			if (!tmdbRequest) throw new Error("No TMDB API key available");
			return { show: await tmdbRequest, episodesBySeason: new Map() };
		},
		staleTime: 24 * 60 * 60 * 1000,
		// Default gcTime (5 min) dropped the page data soon after leaving → reopening re-ran
		// the whole load (catalog read / TMDB) behind a spinner. Keep it as long as it's fresh
		gcTime: 24 * 60 * 60 * 1000,
	});

	return {
		...result,
		data: result.data?.show as TMDBShow | undefined,
		episodesBySeason: result.data?.episodesBySeason ?? new Map<number, TMDBEpisode[]>(),
	};
}

/**
 * Catalog-shaped entry from the show page's details (inverse of catalogShowToResult) — lets a
 * movie marked / added from its page seed the shared catalog cache, so its watchlist card has
 * title / poster / year / director right away (0 reads, no TMDB heal). Keeps `base` fields
 * the details don't carry (logo, tracking counts).
 */
export function catalogFromShowDetails(
	show: TMDBShow,
	mediaType: MediaType,
	base?: CatalogShow | null,
): CatalogShow {
	const crew = show.credits?.crew;
	const names = (pick: (c: { job: string; department: string }) => boolean) =>
		crew?.filter(pick).map((c) => c.name) ?? [];
	const genres = ((show as any).genres as Array<{ name?: string }> | undefined)
		?.map((g) => g.name)
		.filter((g): g is string => !!g);
	return {
		...(base ?? {}),
		tmdbId: show.id,
		mediaType,
		title: show.title || show.name || base?.title || "",
		posterPath: show.poster_path ?? base?.posterPath ?? null,
		backdropPath: show.backdrop_path ?? base?.backdropPath ?? null,
		overview: show.overview || base?.overview || "",
		status: show.status ?? base?.status ?? "",
		totalSeasons: base?.totalSeasons ?? show.number_of_seasons ?? 0,
		totalEpisodes: base?.totalEpisodes ?? show.number_of_episodes ?? 0,
		runtime: show.runtime ?? base?.runtime ?? null,
		voteAverage: show.vote_average ?? base?.voteAverage ?? 0,
		firstAirDate: show.first_air_date ?? base?.firstAirDate ?? null,
		releaseDate: show.release_date ?? base?.releaseDate ?? null,
		// Only when the details came with images — missing lets the logo still be fetched
		...(show.images ? { logoPath: pickTitleLogo(show.images.logos) } : {}),
		seasons: base?.seasons ?? [],
		genres: genres?.length ? genres : (base?.genres ?? []),
		// No crew yet (catalog without credits, TMDB patch pending) → leave it for the heal
		...(crew
			? {
					credits: {
						directors: names((c) => c.job === "Director"),
						writers: names((c) => c.department === "Writing"),
						producers: names((c) => c.job === "Producer").slice(0, 3),
					},
				}
			: base?.credits
				? { credits: base.credits }
				: {}),
		trackedBy: base?.trackedBy ?? [],
		trackedByCount: base?.trackedByCount ?? 0,
		lastSyncedAt: base?.lastSyncedAt ?? null,
		partial: false,
	};
}
