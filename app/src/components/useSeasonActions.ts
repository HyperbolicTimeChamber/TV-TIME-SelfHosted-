import { useState, useCallback, useRef, useMemo, useEffect } from "react";
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
	setRewatchCount,
	getSeasonDetails as fetchSeason,
} from "../services";
import type { KnownTracking } from "../services/firestore";
import type { CarouselEpisode } from "../types/episodeCarousel";
import {
	todayStr,
	computeTrackingAdvance,
	computeJumpFrom,
	firstSkippedBefore,
	jumpPromptFor,
	seasonMarkEpisodes,
	rewatchLevel,
	seasonMarkCopy,
	seasonSkipAheadCopy,
	observedRewatchRun,
	firstSkippedSeason,
	rewatchUpToRefs,
	epKey,
	EpisodeRef,
	type JumpPrompt,
} from "../utils";
import { TMDBSeason, TMDBEpisode, MediaType, WatchStatus, WatchAction } from "../types";
import { endSeasonMarking, startSeasonMarking, useSeasonMarking } from "../hooks/seasonMarking";

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
		/** Stored rewatch run number (healed from the episode counts when it drifted) */
		rewatchCount?: number;
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
	/** Absolute rewatch run number to store (see TrackingAdvance.rewatchCount) */
	rewatchCount?: number;
}

/** Rewatch counts already healed this session (`uid_tmdbId_run`) — every season row runs the check */
const healedRewatch = new Set<string>();

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
	const markedFromElsewhere = useSeasonMarking(tmdbId, season.season_number);
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
		/** Watch count the range is brought to (1 = first watch, >1 = rewatch under way) */
		level: number;
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
		/** Rewatch run number while rewatching, else 0 (carousel's watched/backfill rule) */
		rewatchCount: number;
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
		(markedEps: number[], extra: EpisodeRef[] = []) => {
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
			// Episodes of other seasons marked in the same action (multi-season range marks)
			for (const r of extra) {
				const k = epKey(r.season, r.episode);
				counts.set(k, (counts.get(k) ?? 0) + 1);
			}

			// Just added via guardTracking → fresh tracking doc
			const tracking = trackingItem ?? {
				status: WatchStatus.WATCHING,
				nextEpisode: { season: 1, episode: 1 },
			};
			const marked = [
				...extra.map((r) => ({ season: r.season, episode: r.episode })),
				...markedEps.map((n) => ({ season: sn, episode: n })),
			];
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
		async (markedEps: number[], jump = false, extra: EpisodeRef[] = []): Promise<TrackingWrite> => {
			const { order, counts, marked, tracking } = buildAdvanceInputs(markedEps, extra);
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
				rewatchCount: adv.rewatchCount,
			};
		},
		[buildAdvanceInputs, trackingItem, lookupEpisode],
	);

	/** Rewatch under way → its level (episodes reach this count), else null */
	const currentRewatchLevel = useMemo(() => {
		if (!isTracked || !trackingItem) return null;
		const { order, counts, tracking } = buildAdvanceInputs([]);
		return rewatchLevel(order, counts, tracking);
	}, [isTracked, trackingItem, buildAdvanceInputs]);

	/** Episodes a season tick bumps: unwatched (first watch) / not yet rewatched (rewatch) */
	const seasonMarkEps = useMemo(() => {
		const { order, counts, tracking } = buildAdvanceInputs([]);
		const toMark = new Set(
			seasonMarkEpisodes(
				order,
				counts,
				isTracked ? tracking : null,
				season.season_number,
				episodes.map((ep: TMDBEpisode) => ep.episode_number),
			),
		);
		return episodes.filter((ep: TMDBEpisode) => toMark.has(ep.episode_number));
	}, [buildAdvanceInputs, isTracked, season.season_number, episodes]);

	/**
	 * Season tick. `all` ("Mark All Again", mid-rewatch): every episode of the season gets one
	 * more watch, already-rewatched ones too. The pointer still moves as for the rest-of-season
	 * mark — the extra counts on already-rewatched episodes aren't part of the run.
	 */
	const doMarkSeasonWatched = useCallback(async (all = false) => {
		if (!user?.uid || markingSeason) return;
		const eps = all ? episodes : seasonMarkEps;
		if (eps.length === 0) return;

		setMarkingSeason(true);
		try {
			const tw = await resolveTrackingWrite(
				seasonMarkEps.map((ep: TMDBEpisode) => ep.episode_number),
			);

			await markSeasonWatchedCF(
				user.uid,
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
				{
					skipTracking: !tw.advance,
					status: tw.status,
					incrementRewatch: tw.incrementRewatch,
					rewatchCount: tw.rewatchCount,
				},
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
	}, [
		user?.uid,
		markingSeason,
		episodes,
		seasonMarkEps,
		tmdbId,
		season.season_number,
		resolveTrackingWrite,
		queryClient,
	]);

	const handleMarkSeasonWatched = useCallback(
		async (all = false) => {
			const run = () => doMarkSeasonWatched(all);
			if (guardTracking(run)) {
				await run();
			}
		},
		[guardTracking, doMarkSeasonWatched],
	);

	/** Episodes of any season (this one, catalog, else TMDB) — names / runtimes for a mark */
	const episodesOf = useCallback(
		async (sn: number): Promise<TMDBEpisode[]> => {
			if (sn === season.season_number) return episodes;
			const known = episodesBySeason?.get(sn);
			if (known && known.length > 0) return known;
			if (!apiKey) return [];
			try {
				return (await fetchSeason(apiKey, tmdbId, sn)).episodes ?? [];
			} catch {
				return [];
			}
		},
		[season.season_number, episodes, episodesBySeason, apiKey, tmdbId],
	);

	/**
	 * Mark episodes across seasons in one action (season speedster, "Rewatch Up To Here").
	 * One CF call per season; only the last (latest) season's call writes the tracking doc,
	 * resolved over every marked episode. `jump` = explicit "(re)watch from here".
	 */
	const doMarkRefs = useCallback(
		async (refs: EpisodeRef[], jump = false): Promise<EpisodeRef[]> => {
			if (!user?.uid || refs.length === 0) return [];
			const sn = season.season_number;
			const here = refs.filter((r) => r.season === sn).map((r) => r.episode);
			const others = refs.filter((r) => r.season !== sn);
			const bySeason = new Map<number, number[]>();
			for (const r of refs) bySeason.set(r.season, [...(bySeason.get(r.season) ?? []), r.episode]);
			const seasons = [...bySeason.keys()].sort((a, b) => a - b);

			setMarkingSeason(true);
			// Every season this mark covers shows its spinner, not just the row it started from
			startSeasonMarking(tmdbId, seasons);
			try {
				const tw = await resolveTrackingWrite(here, jump, others);
				const now = Timestamp.now();
				for (let i = 0; i < seasons.length; i++) {
					const s = seasons[i];
					const isLast = i === seasons.length - 1;
					const details = await episodesOf(s);
					const eps = bySeason.get(s)!.map((n) => {
						const d = details.find((e: TMDBEpisode) => e.episode_number === n);
						return { episodeNumber: n, name: d?.name || "", runtime: d?.runtime || 0 };
					});
					await markSeasonWatchedCF(
						user.uid,
						tmdbId,
						s,
						eps,
						isLast ? tw.nextEpisode : null,
						isLast ? tw.isComplete : false,
						isLast ? tw.nextEpisodeName : null,
						isLast ? tw.nextEpisodeAirDate : null,
						isLast
							? {
									skipTracking: !tw.advance,
									status: tw.status,
									incrementRewatch: tw.incrementRewatch,
									rewatchCount: tw.rewatchCount,
								}
							: { skipTracking: true },
					);
					for (const e of eps) {
						insertWatchedEpisodeCache(queryClient, user.uid, {
							id: `${tmdbId}_S${String(s).padStart(2, "0")}E${String(e.episodeNumber).padStart(2, "0")}`,
							tmdbShowId: tmdbId,
							season: s,
							episode: e.episodeNumber,
							episodeTitle: e.name,
							runtime: e.runtime,
							lastWatchedAt: now,
							watchedAt: now,
							watchCount: 1,
						});
					}
					endSeasonMarking(tmdbId, [s]);
				}
				return refs;
			} catch (err: any) {
				console.error("markEpisodes failed:", err);
				Alert.alert("Error", err.message || "Failed to mark episodes.");
				return [];
			} finally {
				endSeasonMarking(tmdbId, seasons);
				setMarkingSeason(false);
			}
		},
		[user?.uid, season.season_number, resolveTrackingWrite, episodesOf, tmdbId, queryClient],
	);

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
					{
						status: tw.status,
						incrementRewatch: tw.incrementRewatch,
						rewatchCount: tw.rewatchCount,
					},
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
	// `upTo` ("Start a Rewatch?" only): E1 → this episode, for "Rewatch Up To Here"
	const [jumpModal, setJumpModal] = useState<
		({ ep: TMDBEpisode; upTo: EpisodeRef[] } & JumpPrompt) | null
	>(null);

	/** Mark directly if it continues the watch flow, else ask whether to jump the watchlist here */
	const markOrAskJump = useCallback(
		(ep: TMDBEpisode) => {
			if (!isTracked || willAdvance(ep.episode_number)) {
				handleMarkWatched(ep);
				return;
			}
			// Rewatch under way → skip-ahead within it, never "start a rewatch"
			const { order, counts, tracking } = buildAdvanceInputs([]);
			const prompt = jumpPromptFor(order, counts, tracking, {
				season: season.season_number,
				episode: ep.episode_number,
			});
			if (!prompt) {
				handleMarkWatched(ep);
				return;
			}
			const upTo = prompt.rewatch
				? rewatchUpToRefs(order, counts, { season: season.season_number, episode: ep.episode_number })
				: [];
			setJumpModal({ ep, upTo, ...prompt });
		},
		[isTracked, willAdvance, handleMarkWatched, buildAdvanceInputs, season.season_number],
	);

	/** "Rewatch Up To Here": start the rewatch with E1 → this episode all rewatched */
	const markRewatchUpTo = useCallback(
		async (refs: EpisodeRef[]) => {
			await doMarkRefs(refs, true);
		},
		[doMarkRefs],
	);

	/** Live tracking fields → the unwatch writes skip their tracking-doc read */
	const knownTracking = useMemo<KnownTracking | undefined>(
		() =>
			trackingItem
				? { status: trackingItem.status, rewatchCount: trackingItem.rewatchCount ?? 0 }
				: undefined,
		[trackingItem],
	);

	/**
	 * Take one watch off an episode (`oneWatch`: "watched once less", carousel Unwatch) or
	 * unwatch it completely. The carousel's Unwatch drops the count by one — deleting every
	 * watch there wiped earlier runs mid-rewatch. The local cache goes
	 * first so the row, the season count / circle and the carousel update at once; restored
	 * if the write fails.
	 */
	const unwatchEpisode = useCallback(
		async (episode: number, oneWatch: boolean) => {
			if (!user?.uid) return;
			const sn = season.season_number;
			const watched = watchedMap.get(episode);
			const count = watched?.watchCount || 0;
			if (count <= 0) return;
			const ep = episodes.find((e: TMDBEpisode) => e.episode_number === episode);
			const runtime = watched?.runtime || ep?.runtime || 0;
			const decrement = oneWatch && count > 1;
			removeWatchedEpisodeCache(queryClient, user.uid, tmdbId, sn, episode, decrement);
			try {
				if (decrement) {
					await decrementEpisodeWatchCount(
						user.uid,
						tmdbId,
						sn,
						episode,
						runtime,
						count,
						ep?.name || null,
						ep?.air_date || null,
						knownTracking,
					);
				} else {
					await unmarkEpisodeWatched(
						user.uid,
						tmdbId,
						sn,
						episode,
						runtime,
						ep?.name || null,
						ep?.air_date || null,
						knownTracking,
					);
				}
				decrementDailyWatch("episode");
			} catch (err) {
				const now = Timestamp.now();
				insertWatchedEpisodeCache(queryClient, user.uid, {
					id: `${tmdbId}_S${String(sn).padStart(2, "0")}E${String(episode).padStart(2, "0")}`,
					tmdbShowId: tmdbId,
					season: sn,
					episode,
					episodeTitle: ep?.name || "",
					runtime,
					lastWatchedAt: now,
					watchedAt: now,
					watchCount: count,
				});
				throw err;
			}
		},
		[user?.uid, season.season_number, watchedMap, episodes, queryClient, tmdbId, knownTracking],
	);

	const handleSheetAction = useCallback(
		async (action: WatchAction) => {
			if (!user?.uid || !sheetTarget) return;

			try {
				if (sheetTarget.type === "episode") {
					const ep = sheetTarget.ep;
					if (action === "rewatch") {
						markOrAskJump(ep);
					} else if (action === "not_watched") {
						await unwatchEpisode(ep.episode_number, false);
					} else if (action === "watched_once_less") {
						await unwatchEpisode(ep.episode_number, true);
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
							await unmarkSeasonWatched(user.uid, tmdbId, toUnmark, knownTracking);
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
				// Update query cache locally (episode actions: done up front by unwatchEpisode;
				// "rewatch" handled by handleMarkWatched → doMarkEpisodeWatched)
				if (sheetTarget.type === "season") {
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
			unwatchEpisode,
			knownTracking,
		],
	);

	/**
	 * Mark fromEp–toEp; only episodes below `level` (1 = unwatched, >1 = not yet rewatched).
	 * Resolves with the episodes marked (empty on failure).
	 */
	const doMarkEpisodeRange = useCallback(
		async (fromEp: number, toEp: number, level = 1): Promise<EpisodeRef[]> => {
			if (!user?.uid) return [];
			const eps = episodes;
			const epsToMark = eps.filter(
				(e: TMDBEpisode) =>
					e.episode_number >= fromEp &&
					e.episode_number <= toEp &&
					(watchedMap.get(e.episode_number)?.watchCount || 0) < level,
			);
			if (epsToMark.length === 0) return [];

			setMarkingEps(new Set(epsToMark.map((e: TMDBEpisode) => e.episode_number)));
			try {
				// Use batch CF instead of sequential individual marks — survives backgrounding
				const tw = await resolveTrackingWrite(
					epsToMark.map((ep: TMDBEpisode) => ep.episode_number),
				);

				await markSeasonWatchedCF(
					user.uid,
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
					{
					skipTracking: !tw.advance,
					status: tw.status,
					incrementRewatch: tw.incrementRewatch,
					rewatchCount: tw.rewatchCount,
				},
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
				return epsToMark.map((ep: TMDBEpisode) => ({
					season: season.season_number,
					episode: ep.episode_number,
				}));
			} catch (err: any) {
				console.error("markEpisodeRange failed:", err);
				Alert.alert("Error", err.message || "Failed to mark episodes.");
				return [];
			} finally {
				setMarkingEps(new Set());
			}
		},
		[user?.uid, episodes, watchedMap, tmdbId, season.season_number, resolveTrackingWrite],
	);

	const markEpisodeRange = useCallback(
		async (fromEp: number, toEp: number, level = 1) => {
			const run = async () => {
				await doMarkEpisodeRange(fromEp, toEp, level);
			};
			if (guardTracking(run)) await run();
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
				// Tracked → same backfill (speedster) rule as the season list, relative to the
				// watchlist pointer; during a rewatch only this run's counts count as watched
				currentNextEpisode:
					isTracked && trackingItem?.nextEpisode
						? {
								season: trackingItem.nextEpisode.season,
								episode: trackingItem.nextEpisode.episode,
							}
						: null,
				rewatchCount: currentRewatchLevel ? currentRewatchLevel - 1 : 0,
			});
			setEpInfoVisible(true);
		},
		[
			isTracked,
			trackingItem,
			currentRewatchLevel,
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

	/** Carousel backfill: pointer (or E1 of this season) through `episode`, up to the level */
	const handleCarouselMarkThrough = useCallback(
		async (_tmdbId: number, _season: number, episode: number): Promise<EpisodeRef[]> => {
			const ne = trackingItem?.nextEpisode;
			const from = ne && ne.season === season.season_number ? ne.episode : 1;
			return doMarkEpisodeRange(from, episode, currentRewatchLevel ?? 1);
		},
		[trackingItem, season.season_number, currentRewatchLevel, doMarkEpisodeRange],
	);

	const handleCarouselUnmark = useCallback(
		async (_tmdbId: number, _season: number, episode: number) => {
			try {
				await unwatchEpisode(episode, true);
			} catch (err: any) {
				console.error("unmarkEpisode failed:", err);
				Alert.alert("Error", err.message || "Failed to unwatch episode.");
			}
		},
		[unwatchEpisode],
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

			// Unwatched (or not-yet-rewatched, during a rewatch) earlier episodes in this season
			// → "mark previous?" first. "Just This One" then falls through to the jump question.
			const { order, counts, tracking } = buildAdvanceInputs([]);
			const skipped = firstSkippedBefore(order, counts, tracking, {
				season: season.season_number,
				episode: ep.episode_number,
			});
			if (skipped) {
				setSkipModalData({ ...skipped, targetEp: ep });
				setSkipModalVisible(true);
				return;
			}
			markOrAskJump(ep);
		},
		[handleMarkWatched, isTracked, buildAdvanceInputs, season.season_number, markOrAskJump],
	);

	// Season tick asks first (fully watched → it's a rewatch of the whole season)
	const [seasonConfirmVisible, setSeasonConfirmVisible] = useState(false);
	// Season speedster: earlier seasons (first watch) / rewatch episodes before this season
	// are still unwatched → offer to mark them too
	const [seasonSkip, setSeasonSkip] = useState<{
		firstSeason: number;
		level: number;
		refs: EpisodeRef[];
	} | null>(null);
	const handleSeasonPress = useCallback(() => {
		if (isTracked && !watchedLoading) {
			const { order, counts, tracking } = buildAdvanceInputs([]);
			const skipped = firstSkippedSeason(order, counts, tracking, season.season_number, todayStr());
			if (skipped) {
				setSeasonSkip(skipped);
				return;
			}
		}
		setSeasonConfirmVisible(true);
	}, [isTracked, watchedLoading, buildAdvanceInputs, season.season_number]);
	const confirmSeasonMark = useCallback(() => {
		setSeasonConfirmVisible(false);
		handleMarkSeasonWatched();
	}, [handleMarkSeasonWatched]);
	/** "Mark All Again": one more watch for every episode of the season */
	const confirmSeasonMarkAll = useCallback(() => {
		setSeasonConfirmVisible(false);
		handleMarkSeasonWatched(true);
	}, [handleMarkSeasonWatched]);
	/** Season speedster "Mark S1–Sn Watched": the skipped earlier episodes + this season */
	const confirmSeasonSkipAll = useCallback(() => {
		const d = seasonSkip;
		setSeasonSkip(null);
		if (!d) return;
		doMarkRefs([
			...d.refs,
			...seasonMarkEps.map((ep: TMDBEpisode) => ({
				season: season.season_number,
				episode: ep.episode_number,
			})),
		]);
	}, [seasonSkip, doMarkRefs, seasonMarkEps, season.season_number]);
	/** Season speedster "Just This Season" */
	const confirmSeasonSkipJustThis = useCallback(() => {
		setSeasonSkip(null);
		handleMarkSeasonWatched();
	}, [handleMarkSeasonWatched]);
	const seasonSkipCopy = seasonSkip
		? seasonSkipAheadCopy(seasonSkip.firstSeason, season.season_number, seasonSkip.level > 1)
		: null;

	// Self-heal: the stored rewatch run number drifted from what the episode counts show (it
	// used to be +1-bumped only when a rewatch status was entered) — store the observed one.
	// One write per show and run per session; never while a mark is in flight
	useEffect(() => {
		if (!isTracked || !user?.uid || !trackingItem || watchedLoading) return;
		if (markingSeason || markingEps.size > 0) return;
		const { order, counts, tracking } = buildAdvanceInputs([]);
		const run = observedRewatchRun(order, counts, tracking);
		if (run === null || (trackingItem.rewatchCount ?? 0) === run) return;
		const key = `${user.uid}_${tmdbId}_${run}`;
		if (healedRewatch.has(key)) return;
		healedRewatch.add(key);
		setRewatchCount(user.uid, tmdbId, run).catch(() => healedRewatch.delete(key));
	}, [
		isTracked,
		user?.uid,
		trackingItem,
		watchedLoading,
		markingSeason,
		markingEps,
		buildAdvanceInputs,
		tmdbId,
	]);

	// Season tick confirm copy — says what the mark really does (rest of season / rewatch)
	const seasonConfirmCopy = seasonMarkCopy({
		seasonNumber: season.season_number,
		seasonName: season.name,
		total: episodes.length,
		toMark: seasonMarkEps.length,
		allWatched,
		inRewatch: currentRewatchLevel !== null,
	});

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
		// Also while another row's mark covers this season (season speedster)
		markingSeason: markingSeason || markedFromElsewhere,
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
		currentRewatchLevel,
		seasonMarkEps,
		seasonConfirmCopy,
		seasonConfirmVisible,
		setSeasonConfirmVisible,
		confirmSeasonMark,
		confirmSeasonMarkAll,
		seasonSkip,
		setSeasonSkip,
		seasonSkipCopy,
		confirmSeasonSkipAll,
		confirmSeasonSkipJustThis,
		doMarkRefs,
		markRewatchUpTo,
		unwatchEpisode,
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
