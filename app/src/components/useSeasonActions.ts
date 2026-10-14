import { useState, useCallback, useRef, useMemo } from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Timestamp } from "@react-native-firebase/firestore";
import {
	useSeasonDetails,
	useShowWatchedEpisodes,
	useUpcomingMutations,
	insertWatchedEpisodeCache,
	removeWatchedEpisodeCache,
	incrementDailyWatch,
	decrementDailyWatch,
} from "../hooks";
import { useAuthStore } from "../stores";
import {
	markEpisodeWatched,
	markSeasonWatchedCF,
	addToTracking,
	unmarkEpisodeWatched,
	decrementEpisodeWatchCount,
	unmarkSeasonWatched,
	decrementSeasonWatchCount,
	getSeasonDetails as fetchSeason,
} from "../services";
import type { CarouselEpisode } from "../types/episodeCarousel";
import { todayStr, computeTrackingAdvance, computeJumpFrom, epKey, EpisodeRef } from "../utils";
import { TMDBSeason, TMDBEpisode, MediaType, WatchStatus, WatchAction } from "../types";

export interface SeasonDropdownProps {
	tmdbId: number;
	season: TMDBSeason;
	showTitle: string;
	showPosterPath: string | null;
	showBackdropPath?: string | null;
	isTracked?: boolean;
	preloadedEpisodes?: TMDBEpisode[];
	/** Current tracking doc (status + pointer) — drives whether marks move the watchlist */
	trackingItem?: {
		status?: WatchStatus;
		nextEpisode?: EpisodeRef | null;
		nextEpisodeName?: string | null;
		nextEpisodeAirDate?: string | null;
	} | null;
	/** All regular seasons of the show, in order */
	seasonLayout?: Array<{ season: number; episodeCount: number }>;
	/** Episodes of other seasons when known (catalog) */
	episodesBySeason?: Map<number, TMDBEpisode[]>;
}

export interface TrackingWrite {
	advance: boolean;
	nextEpisode: EpisodeRef | null;
	nextEpisodeName: string | null;
	nextEpisodeAirDate: string | null;
	isComplete: boolean;
	status?: WatchStatus;
	incrementRewatch: boolean;
}

/**
 * Season dropdown state + marking logic (watch rules, skip/jump prompts, action
 * sheet, episode carousel data). Shared by the mobile SeasonDropdown and the web
 * season list — keep UI out of here.
 */
export function useSeasonActions({
	tmdbId,
	season,
	showTitle,
	showPosterPath,
	showBackdropPath,
	isTracked,
	preloadedEpisodes,
	trackingItem,
	seasonLayout,
	episodesBySeason,
}: SeasonDropdownProps) {
	const [expanded, setExpanded] = useState(false);
	const [markingEps, setMarkingEps] = useState<Set<number>>(new Set());
	const [markingSeason, setMarkingSeason] = useState(false);
	const user = useAuthStore((s) => s.user);
	const queryClient = useQueryClient();
	const { mutateCachedUpcoming, rollbackUpcoming, removeWatchedFromPast } = useUpcomingMutations();
	const apiKey = useAuthStore((s) => s.appTmdbApiKey)!;
	const {
		data: seasonData,
		isLoading,
		imagesLoading,
		imagesData,
	} = useSeasonDetails(
		tmdbId,
		season.season_number,
		!preloadedEpisodes, // skip fetch if preloaded
		expanded, // only fetch TMDB images when dropdown open
	);

	const { episodes: watchedEps, loading: watchedLoading } = useShowWatchedEpisodes(
		user?.uid,
		tmdbId,
	);

	// Skipped episodes modal state
	const [skipModalVisible, setSkipModalVisible] = useState(false);
	const [skipModalData, setSkipModalData] = useState<{
		firstSkipped: number;
		targetEp: TMDBEpisode;
	} | null>(null);

	// Episode info modal state
	const [epInfoVisible, setEpInfoVisible] = useState(false);
	const [epInfoData, setEpInfoData] = useState<{
		tmdbId: number;
		showTitle: string;
		showPosterPath: string | null;
		showBackdropPath: string | null;
		episodes: CarouselEpisode[];
		initialIndex: number;
		watchedKeys: Map<string, number>;
		currentNextEpisode: { season: number; episode: number } | null;
	} | null>(null);

	// Add-to-watchlist modal state
	const [addModalVisible, setAddModalVisible] = useState(false);
	const [addModalLoading, setAddModalLoading] = useState(false);
	const [addModalError, setAddModalError] = useState<string | null>(null);
	const pendingAction = useRef<(() => Promise<void>) | null>(null);

	const guardTracking = useCallback(
		(action: () => Promise<void>): boolean => {
			if (isTracked) return true;
			pendingAction.current = action;
			setAddModalError(null);
			setAddModalVisible(true);
			return false;
		},
		[isTracked],
	);

	const handleAddAndMark = useCallback(async () => {
		if (!user?.uid) return;
		setAddModalLoading(true);
		setAddModalError(null);
		try {
			await addToTracking(user.uid, tmdbId, MediaType.TV);
			setAddModalVisible(false);
			const action = pendingAction.current;
			pendingAction.current = null;
			if (action) await action();
		} catch (err: any) {
			setAddModalError(err.message || "Failed to add to watchlist.");
		} finally {
			setAddModalLoading(false);
		}
	}, [user?.uid, tmdbId]);

	// Action sheet state
	const [sheetVisible, setSheetVisible] = useState(false);
	const [sheetTarget, setSheetTarget] = useState<
		| {
				type: "episode";
				ep: TMDBEpisode;
				watchCount: number;
		  }
		| {
				type: "season";
				watchCount: number;
		  }
		| null
	>(null);

	const watchedMap = new Map<number, { watchCount: number; runtime: number }>();
	for (const ep of watchedEps) {
		if (ep.season === season.season_number) {
			watchedMap.set(ep.episode, {
				watchCount: ep.watchCount,
				runtime: ep.runtime,
			});
		}
	}

	const rawEpisodes = preloadedEpisodes ?? seasonData?.episodes ?? [];
	// Enrich with TMDB images if available
	const episodes = useMemo(() => {
		if (!imagesData?.episodes) return rawEpisodes;
		const imgMap = new Map(imagesData.episodes.map((e) => [e.episode_number, e]));
		return rawEpisodes.map((ep) => {
			if (ep.still_path) return ep;
			const tmdb = imgMap.get(ep.episode_number);
			return tmdb ? { ...ep, still_path: tmdb.still_path, overview: tmdb.overview } : ep;
		});
	}, [rawEpisodes, imagesData]);
	// Only count watched episodes that exist in the current season's episode list
	// (filters out orphans from TMDB/TVDB season restructuring)
	const watchedCount = episodes.filter((ep: TMDBEpisode) =>
		watchedMap.has(ep.episode_number),
	).length;
	const minWatchCount =
		episodes.length > 0
			? Math.min(
					...episodes.map((ep: TMDBEpisode) => watchedMap.get(ep.episode_number)?.watchCount || 0),
				)
			: 0;
	const allWatched = episodes.length > 0 && minWatchCount > 0;
	const partiallyWatched = watchedCount > 0 && !allWatched;

	/** Look up name/air date of an episode (local season → catalog → TMDB) */
	const lookupEpisode = useCallback(
		async (ref: EpisodeRef): Promise<{ name: string | null; airDate: string | null }> => {
			const local =
				ref.season === season.season_number ? episodes : episodesBySeason?.get(ref.season);
			let ep = local?.find((e: TMDBEpisode) => e.episode_number === ref.episode);
			if (!ep && apiKey) {
				try {
					const sd = await fetchSeason(apiKey, tmdbId, ref.season);
					ep = sd.episodes?.find((e) => e.episode_number === ref.episode);
				} catch {}
			}
			return { name: ep?.name || null, airDate: ep?.air_date || null };
		},
		[episodes, episodesBySeason, season.season_number, apiKey, tmdbId],
	);

	/** Watch order, post-mark counts and tracking state for the advance rules */
	const buildAdvanceInputs = useCallback(
		(markedEps: number[]) => {
			const sn = season.season_number;
			const layout =
				seasonLayout && seasonLayout.length > 0
					? [...seasonLayout].filter((l) => l.season > 0).sort((a, b) => a.season - b.season)
					: [{ season: sn, episodeCount: episodes.length }];
			const order: EpisodeRef[] = [];
			for (const l of layout) {
				const eps = l.season === sn ? episodes : episodesBySeason?.get(l.season);
				if (eps && eps.length > 0) {
					for (const e of eps) {
						order.push({
							season: l.season,
							episode: e.episode_number,
							airDate: e.air_date ?? null,
						});
					}
				} else {
					for (let i = 1; i <= l.episodeCount; i++) order.push({ season: l.season, episode: i });
				}
			}

			const counts = new Map<string, number>();
			for (const w of watchedEps) counts.set(epKey(w.season, w.episode), w.watchCount || 0);
			for (const n of markedEps) counts.set(epKey(sn, n), (counts.get(epKey(sn, n)) ?? 0) + 1);

			// Just added via guardTracking → fresh tracking doc
			const tracking = trackingItem ?? {
				status: WatchStatus.WATCHING,
				nextEpisode: { season: 1, episode: 1 },
			};
			const marked = markedEps.map((n) => ({ season: sn, episode: n }));
			return { order, counts, marked, tracking };
		},
		[season.season_number, seasonLayout, episodes, episodesBySeason, watchedEps, trackingItem],
	);

	/** Would marking this single episode move the watchlist pointer on its own? */
	const willAdvance = useCallback(
		(epNumber: number) => {
			const { order, counts, marked, tracking } = buildAdvanceInputs([epNumber]);
			return computeTrackingAdvance(order, counts, marked, tracking, todayStr()).advance;
		},
		[buildAdvanceInputs],
	);

	/**
	 * Resolve how marking `markedEps` (this season) affects the tracking doc.
	 * Pointer only moves when the mark continues an unbroken watch run — see computeTrackingAdvance.
	 * `jump` = user explicitly chose to (re)watch from this episode.
	 */
	const resolveTrackingWrite = useCallback(
		async (markedEps: number[], jump = false): Promise<TrackingWrite> => {
			const { order, counts, marked, tracking } = buildAdvanceInputs(markedEps);
			const adv = jump
				? computeJumpFrom(order, counts, marked, tracking)
				: computeTrackingAdvance(order, counts, marked, tracking, todayStr());

			if (!adv.advance) {
				// Fallback values keep pointer intact on CF versions that ignore skipTracking
				return {
					advance: false,
					nextEpisode: tracking.nextEpisode ?? null,
					nextEpisodeName: trackingItem?.nextEpisodeName ?? null,
					nextEpisodeAirDate: trackingItem?.nextEpisodeAirDate ?? null,
					isComplete: false,
					incrementRewatch: false,
				};
			}
			const info = adv.nextEpisode
				? await lookupEpisode(adv.nextEpisode)
				: { name: null, airDate: null };
			return {
				advance: true,
				nextEpisode: adv.nextEpisode,
				nextEpisodeName: info.name,
				nextEpisodeAirDate: info.airDate,
				isComplete: !adv.nextEpisode,
				status: adv.status,
				incrementRewatch: adv.incrementRewatch,
			};
		},
		[buildAdvanceInputs, trackingItem, lookupEpisode],
	);

	const doMarkSeasonWatched = useCallback(async () => {
		if (!user?.uid || markingSeason) return;
		const eps = episodes;
		if (eps.length === 0) return;

		setMarkingSeason(true);
		try {
			const tw = await resolveTrackingWrite(eps.map((ep: TMDBEpisode) => ep.episode_number));

			await markSeasonWatchedCF(
				tmdbId,
				season.season_number,
				eps.map((ep: TMDBEpisode) => ({
					episodeNumber: ep.episode_number,
					name: ep.name,
					runtime: ep.runtime || 0,
				})),
				tw.nextEpisode,
				tw.isComplete,
				tw.nextEpisodeName,
				tw.nextEpisodeAirDate,
				{ skipTracking: !tw.advance, status: tw.status, incrementRewatch: tw.incrementRewatch },
			);
			const now = Timestamp.now();
			for (const ep of eps) {
				insertWatchedEpisodeCache(queryClient, user.uid, {
					id: `${tmdbId}_S${String(season.season_number).padStart(2, "0")}E${String(ep.episode_number).padStart(2, "0")}`,
					tmdbShowId: tmdbId,
					season: season.season_number,
					episode: ep.episode_number,
					episodeTitle: ep.name,
					runtime: ep.runtime || 0,
					lastWatchedAt: now,
					watchedAt: now,
					watchCount: 1,
				});
			}
		} catch (err: any) {
			console.error("markSeasonWatched failed:", err);
			Alert.alert("Error", err.message || "Failed to mark season as watched.");
		} finally {
			setMarkingSeason(false);
		}
	}, [user?.uid, markingSeason, episodes, tmdbId, season.season_number, resolveTrackingWrite]);

	const handleMarkSeasonWatched = useCallback(async () => {
		if (guardTracking(doMarkSeasonWatched)) {
			await doMarkSeasonWatched();
		}
	}, [guardTracking, doMarkSeasonWatched]);

	const doMarkEpisodeWatched = useCallback(
		async (ep: TMDBEpisode, jump = false) => {
			if (!user?.uid || markingEps.size > 0) return;
			setMarkingEps(new Set([ep.episode_number]));

			// Optimistic upcoming update
			const snapshot = mutateCachedUpcoming((prev) =>
				prev.filter(
					(e) =>
						!(
							e.tmdbShowId === tmdbId &&
							e.season === season.season_number &&
							e.episode === ep.episode_number
						),
				),
			);

			try {
				const tw = await resolveTrackingWrite([ep.episode_number], jump);

				await markEpisodeWatched(
					user.uid,
					tmdbId,
					season.season_number,
					ep.episode_number,
					ep.name,
					ep.runtime || 0,
					tw.nextEpisode,
					tw.isComplete,
					!tw.advance,
					tw.nextEpisodeName,
					tw.nextEpisodeAirDate,
					{ status: tw.status, incrementRewatch: tw.incrementRewatch },
				);
				const now = Timestamp.now();
				insertWatchedEpisodeCache(queryClient, user.uid, {
					id: `${tmdbId}_S${String(season.season_number).padStart(2, "0")}E${String(ep.episode_number).padStart(2, "0")}`,
					tmdbShowId: tmdbId,
					season: season.season_number,
					episode: ep.episode_number,
					episodeTitle: ep.name,
					runtime: ep.runtime || 0,
					lastWatchedAt: now,
					watchedAt: now,
					watchCount: 1,
				});
				incrementDailyWatch("episode");
				removeWatchedFromPast(tmdbId, season.season_number, ep.episode_number);
			} catch (err: any) {
				rollbackUpcoming(snapshot);
				console.error("markEpisodeWatched failed:", err);
				Alert.alert("Error", err.message || "Failed to mark episode as watched.");
			} finally {
				setMarkingEps(new Set());
			}
		},
		[
			user?.uid,
			markingEps,
			tmdbId,
			season.season_number,
			resolveTrackingWrite,
			queryClient,
			mutateCachedUpcoming,
			rollbackUpcoming,
			removeWatchedFromPast,
		],
	);

	const handleMarkWatched = useCallback(
		async (ep: TMDBEpisode, jump = false) => {
			if (guardTracking(() => doMarkEpisodeWatched(ep, jump))) {
				await doMarkEpisodeWatched(ep, jump);
			}
		},
		[guardTracking, doMarkEpisodeWatched],
	);

	// "Watch/rewatch from here?" — asked when a mark wouldn't move the watchlist
	const [jumpModal, setJumpModal] = useState<{
		ep: TMDBEpisode;
		rewatch: boolean;
		/** Earlier episodes are still unwatched → jumping skips them */
		skipsPrevious: boolean;
	} | null>(null);

	/** Mark directly if it continues the watch flow, else ask whether to jump the watchlist here */
	const markOrAskJump = useCallback(
		(ep: TMDBEpisode) => {
			if (!isTracked || willAdvance(ep.episode_number)) {
				handleMarkWatched(ep);
				return;
			}
			const count = watchedMap.get(ep.episode_number)?.watchCount || 0;
			const { order, counts } = buildAdvanceInputs([]);
			const idx = order.findIndex(
				(o) => o.season === season.season_number && o.episode === ep.episode_number,
			);
			const skipsPrevious =
				count === 0 &&
				order.slice(0, Math.max(0, idx)).some((o) => !counts.get(epKey(o.season, o.episode)));
			setJumpModal({ ep, rewatch: count > 0, skipsPrevious });
		},
		[
			isTracked,
			willAdvance,
			handleMarkWatched,
			watchedMap,
			buildAdvanceInputs,
			season.season_number,
		],
	);

	const handleSheetAction = useCallback(
		async (action: WatchAction) => {
			if (!user?.uid || !sheetTarget) return;

			try {
				if (sheetTarget.type === "episode") {
					const ep = sheetTarget.ep;
					const watched = watchedMap.get(ep.episode_number);
					if (action === "rewatch") {
						markOrAskJump(ep);
					} else if (action === "not_watched") {
						await unmarkEpisodeWatched(
							user.uid,
							tmdbId,
							season.season_number,
							ep.episode_number,
							watched?.runtime || ep.runtime || 0,
							ep.name,
						);
						decrementDailyWatch("episode");
					} else if (action === "watched_once_less") {
						await decrementEpisodeWatchCount(
							user.uid,
							tmdbId,
							season.season_number,
							ep.episode_number,
							watched?.runtime || ep.runtime || 0,
							watched?.watchCount || 1,
							ep.name,
						);
						decrementDailyWatch("episode");
					}
				} else if (sheetTarget.type === "season") {
					if (action === "rewatch") {
						await handleMarkSeasonWatched();
					} else if (action === "not_watched") {
						const toUnmark = episodes
							.filter((ep: TMDBEpisode) => watchedMap.has(ep.episode_number))
							.map((ep: TMDBEpisode) => ({
								season: season.season_number,
								episode: ep.episode_number,
								runtime: watchedMap.get(ep.episode_number)!.runtime,
							}));
						if (toUnmark.length > 0) {
							await unmarkSeasonWatched(user.uid, tmdbId, toUnmark);
						}
					} else if (action === "watched_once_less") {
						const toDecrement = episodes
							.filter((ep: TMDBEpisode) => {
								const w = watchedMap.get(ep.episode_number);
								return w && w.watchCount > 0;
							})
							.map((ep: TMDBEpisode) => {
								const w = watchedMap.get(ep.episode_number)!;
								return {
									season: season.season_number,
									episode: ep.episode_number,
									runtime: w.runtime,
									watchCount: w.watchCount,
								};
							});
						if (toDecrement.length > 0) {
							await decrementSeasonWatchCount(user.uid, tmdbId, toDecrement);
						}
					}
				}
				// Update query cache locally
				if (sheetTarget.type === "episode") {
					const ep = sheetTarget.ep;
					if (action === "not_watched") {
						removeWatchedEpisodeCache(
							queryClient,
							user.uid,
							tmdbId,
							season.season_number,
							ep.episode_number,
						);
					} else if (action === "watched_once_less") {
						removeWatchedEpisodeCache(
							queryClient,
							user.uid,
							tmdbId,
							season.season_number,
							ep.episode_number,
							true,
						);
					}
					// "rewatch" handled by handleMarkWatched → doMarkEpisodeWatched
				} else if (sheetTarget.type === "season") {
					if (action === "not_watched") {
						for (const ep of episodes) {
							if (watchedMap.has(ep.episode_number)) {
								removeWatchedEpisodeCache(
									queryClient,
									user.uid,
									tmdbId,
									season.season_number,
									ep.episode_number,
								);
							}
						}
					} else if (action === "watched_once_less") {
						for (const ep of episodes) {
							const w = watchedMap.get(ep.episode_number);
							if (w && w.watchCount > 0) {
								removeWatchedEpisodeCache(
									queryClient,
									user.uid,
									tmdbId,
									season.season_number,
									ep.episode_number,
									true,
								);
							}
						}
					}
					// "rewatch" handled by handleMarkSeasonWatched → doMarkSeasonWatched
				}
			} catch (err: any) {
				console.error("Watch action failed:", err);
				Alert.alert("Error", err.message || "Action failed.");
			}
			setSheetTarget(null);
		},
		[
			user?.uid,
			sheetTarget,
			tmdbId,
			season.season_number,
			seasonData,
			watchedMap,
			markOrAskJump,
			handleMarkSeasonWatched,
			queryClient,
		],
	);

	const doMarkEpisodeRange = useCallback(
		async (fromEp: number, toEp: number) => {
			if (!user?.uid) return;
			const eps = episodes;
			const epsToMark = eps.filter(
				(e: TMDBEpisode) =>
					e.episode_number >= fromEp &&
					e.episode_number <= toEp &&
					!watchedMap.has(e.episode_number),
			);
			if (epsToMark.length === 0) return;

			setMarkingEps(new Set(epsToMark.map((e: TMDBEpisode) => e.episode_number)));
			try {
				// Use batch CF instead of sequential individual marks — survives backgrounding
				const tw = await resolveTrackingWrite(
					epsToMark.map((ep: TMDBEpisode) => ep.episode_number),
				);

				await markSeasonWatchedCF(
					tmdbId,
					season.season_number,
					epsToMark.map((ep: TMDBEpisode) => ({
						episodeNumber: ep.episode_number,
						name: ep.name,
						runtime: ep.runtime || 0,
					})),
					tw.nextEpisode,
					tw.isComplete,
					tw.nextEpisodeName,
					tw.nextEpisodeAirDate,
					{ skipTracking: !tw.advance, status: tw.status, incrementRewatch: tw.incrementRewatch },
				);

				const now = Timestamp.now();
				for (const ep of epsToMark) {
					insertWatchedEpisodeCache(queryClient, user.uid, {
						id: `${tmdbId}_S${String(season.season_number).padStart(2, "0")}E${String(ep.episode_number).padStart(2, "0")}`,
						tmdbShowId: tmdbId,
						season: season.season_number,
						episode: ep.episode_number,
						episodeTitle: ep.name,
						runtime: ep.runtime || 0,
						lastWatchedAt: now,
						watchedAt: now,
						watchCount: 1,
					});
				}
			} catch (err: any) {
				console.error("markEpisodeRange failed:", err);
				Alert.alert("Error", err.message || "Failed to mark episodes.");
			} finally {
				setMarkingEps(new Set());
			}
		},
		[user?.uid, episodes, watchedMap, tmdbId, season.season_number, resolveTrackingWrite],
	);

	const markEpisodeRange = useCallback(
		async (fromEp: number, toEp: number) => {
			if (guardTracking(() => doMarkEpisodeRange(fromEp, toEp))) {
				await doMarkEpisodeRange(fromEp, toEp);
			}
		},
		[guardTracking, doMarkEpisodeRange],
	);

	const handleEpisodePress = useCallback(
		(ep: TMDBEpisode) => {
			const today = todayStr();
			const carouselEps: CarouselEpisode[] = episodes
				.filter((e: TMDBEpisode) => !e.air_date || e.air_date <= today)
				.map((e: TMDBEpisode) => ({
					season: season.season_number,
					episode: e.episode_number,
					title: e.name || null,
					airDate: e.air_date || null,
					runtime: e.runtime || null,
					stillPath: e.still_path || null,
					overview: e.overview || null,
				}));

			const idx = carouselEps.findIndex((e) => e.episode === ep.episode_number);
			const wKeys = new Map<string, number>();
			for (const [epNum, data] of watchedMap) {
				wKeys.set(
					`S${String(season.season_number).padStart(2, "0")}E${String(epNum).padStart(2, "0")}`,
					data.watchCount,
				);
			}

			setEpInfoData({
				tmdbId,
				showTitle,
				showPosterPath,
				showBackdropPath: showBackdropPath ?? null,
				episodes: carouselEps,
				initialIndex: Math.max(0, idx),
				watchedKeys: wKeys,
				currentNextEpisode: null,
			});
			setEpInfoVisible(true);
		},
		[
			showTitle,
			season.season_number,
			episodes,
			watchedMap,
			tmdbId,
			showPosterPath,
			showBackdropPath,
		],
	);

	const handleCarouselMark = useCallback(
		async (_tmdbId: number, _season: number, episode: number) => {
			const ep = episodes.find((e: TMDBEpisode) => e.episode_number === episode);
			if (ep) await doMarkEpisodeWatched(ep);
		},
		[episodes, doMarkEpisodeWatched],
	);

	const handleCarouselMarkThrough = useCallback(
		async (_tmdbId: number, _season: number, episode: number) => {
			const firstUnwatched = episodes.find((e: TMDBEpisode) => !watchedMap.has(e.episode_number));
			if (firstUnwatched) {
				await doMarkEpisodeRange(firstUnwatched.episode_number, episode);
			}
		},
		[episodes, watchedMap, doMarkEpisodeRange],
	);

	const handleCarouselUnmark = useCallback(
		async (_tmdbId: number, _season: number, episode: number) => {
			if (!user?.uid) return;
			const watched = watchedMap.get(episode);
			const ep = episodes.find((e: TMDBEpisode) => e.episode_number === episode);
			await unmarkEpisodeWatched(
				user.uid,
				tmdbId,
				season.season_number,
				episode,
				watched?.runtime || ep?.runtime || 0,
				ep?.name || null,
			);
			removeWatchedEpisodeCache(queryClient, user.uid, tmdbId, season.season_number, episode);
			decrementDailyWatch("episode");
		},
		[user?.uid, tmdbId, season.season_number, watchedMap, episodes, queryClient],
	);

	const handleEpisodeLongPress = useCallback(
		(ep: TMDBEpisode) => {
			const count = watchedMap.get(ep.episode_number)?.watchCount || 0;
			if (count > 0) {
				setSheetTarget({ type: "episode", ep, watchCount: count });
				setSheetVisible(true);
			}
		},
		[watchedMap],
	);

	const handleRewatchBadgePress = useCallback(
		(ep: TMDBEpisode) => {
			const count = watchedMap.get(ep.episode_number)?.watchCount || 0;
			if (count > 0) {
				setSheetTarget({ type: "episode", ep, watchCount: count });
				setSheetVisible(true);
			}
		},
		[watchedMap],
	);

	const handleCheckmarkPress = useCallback(
		(ep: TMDBEpisode) => {
			if (!isTracked) {
				handleMarkWatched(ep);
				return;
			}

			// First watch with unwatched earlier episodes in this season → "mark previous?" first.
			// "Just This One" then falls through to the "watch from here?" question.
			const count = watchedMap.get(ep.episode_number)?.watchCount || 0;
			if (count === 0) {
				const skipped = episodes.filter(
					(e: TMDBEpisode) =>
						e.episode_number < ep.episode_number && !watchedMap.has(e.episode_number),
				);
				if (skipped.length > 0) {
					setSkipModalData({ firstSkipped: skipped[0].episode_number, targetEp: ep });
					setSkipModalVisible(true);
					return;
				}
			}
			markOrAskJump(ep);
		},
		[watchedMap, handleMarkWatched, isTracked, episodes, markOrAskJump],
	);

	const handleSeasonPress = useCallback(() => {
		if (allWatched) {
			// Already fully watched → rewatch directly
			handleMarkSeasonWatched();
		} else {
			handleMarkSeasonWatched();
		}
	}, [allWatched, handleMarkSeasonWatched]);

	const handleSeasonLongPress = useCallback(() => {
		if (allWatched) {
			setSheetTarget({ type: "season", watchCount: minWatchCount });
			setSheetVisible(true);
		}
	}, [allWatched, minWatchCount]);

	const sheetLabel =
		sheetTarget?.type === "season"
			? `${season.name}`
			: sheetTarget?.type === "episode"
				? `S${String(season.season_number).padStart(2, "0")}E${String(sheetTarget.ep.episode_number).padStart(2, "0")} - ${sheetTarget.ep.name}`
				: "";

	return {
		expanded,
		setExpanded,
		markingEps,
		setMarkingEps,
		markingSeason,
		setMarkingSeason,
		user,
		queryClient,
		apiKey,
		skipModalVisible,
		setSkipModalVisible,
		skipModalData,
		setSkipModalData,
		epInfoVisible,
		setEpInfoVisible,
		epInfoData,
		setEpInfoData,
		addModalVisible,
		setAddModalVisible,
		addModalLoading,
		setAddModalLoading,
		addModalError,
		setAddModalError,
		pendingAction,
		guardTracking,
		handleAddAndMark,
		sheetVisible,
		setSheetVisible,
		sheetTarget,
		setSheetTarget,
		watchedMap,
		rawEpisodes,
		episodes,
		watchedCount,
		minWatchCount,
		allWatched,
		partiallyWatched,
		lookupEpisode,
		buildAdvanceInputs,
		willAdvance,
		resolveTrackingWrite,
		doMarkSeasonWatched,
		handleMarkSeasonWatched,
		doMarkEpisodeWatched,
		handleMarkWatched,
		jumpModal,
		setJumpModal,
		markOrAskJump,
		handleSheetAction,
		doMarkEpisodeRange,
		markEpisodeRange,
		handleEpisodePress,
		handleCarouselMark,
		handleCarouselMarkThrough,
		handleCarouselUnmark,
		handleEpisodeLongPress,
		handleRewatchBadgePress,
		handleCheckmarkPress,
		handleSeasonPress,
		handleSeasonLongPress,
		sheetLabel,
		mutateCachedUpcoming,
		rollbackUpcoming,
		seasonData,
		isLoading,
		imagesLoading,
		imagesData,
		watchedEps,
		watchedLoading,
	};
}
