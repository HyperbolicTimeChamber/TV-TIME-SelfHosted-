import React, { memo, useState, useCallback, useRef, useMemo } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	StyleSheet,
	ActivityIndicator,
	Alert,
	LayoutAnimation,
	UIManager,
	Platform,
} from "react-native";
import { Image } from "expo-image";
import { useQueryClient } from "@tanstack/react-query";
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
import { Timestamp } from "@react-native-firebase/firestore";
import AnimatedModal from "./modals/AnimatedModal";
import WatchActionSheet, { WatchAction } from "./modals/WatchActionSheet";
import ConfirmModal from "./modals/ConfirmModal";
import CheckmarkButton from "./CheckmarkButton";
import SkeletonLine from "./SkeletonLine";
import EpisodeDetailModal from "./modals/EpisodeDetailModal";
import { colors, spacing, typography, posterSize } from "../theme";
import { TMDBSeason, TMDBEpisode, MediaType } from "../types";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
	UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(dateStr: string): string {
	const [y, m, d] = dateStr.split("-");
	return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

interface Props {
	tmdbId: number;
	season: TMDBSeason;
	showTitle: string;
	showPosterPath: string | null;
	showBackdropPath?: string | null;
	isTracked?: boolean;
	preloadedEpisodes?: TMDBEpisode[];
}

export default memo(function SeasonDropdown({
	tmdbId,
	season,
	showTitle,
	showPosterPath,
	showBackdropPath,
	isTracked,
	preloadedEpisodes,
}: Props) {
	const [expanded, setExpanded] = useState(false);
	const [markingEps, setMarkingEps] = useState<Set<number>>(new Set());
	const [markingSeason, setMarkingSeason] = useState(false);
	const user = useAuthStore((s) => s.user);
	const queryClient = useQueryClient();
	const { mutateCachedUpcoming, rollbackUpcoming } = useUpcomingMutations();
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
		showTitle: string;
		season: number;
		episode: number;
		episodeTitle: string | null;
		overview: string | null;
		stillPath: string | null;
		airDate: string | null;
		runtime: number | null;
		showPosterPath: string | null;
		showBackdropPath: string | null;
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

	const getNextEpisodeInfo = useCallback(
		async (afterSeason: number, afterEpisode?: number) => {
			const eps = episodes;
			if (afterEpisode !== undefined) {
				const nextInSeason = eps.find((e: TMDBEpisode) => e.episode_number === afterEpisode + 1);
				if (nextInSeason) {
					return {
						nextEpisode: {
							season: afterSeason,
							episode: nextInSeason.episode_number,
						},
						nextEpisodeName: nextInSeason.name || null,
						nextEpisodeAirDate: nextInSeason.air_date || null,
						isComplete: false,
					};
				}
			}
			try {
				const nextSeasonData = await fetchSeason(tmdbId, afterSeason + 1);
				const ns = nextSeasonData as {
					episodes: Array<{
						episode_number: number;
						name?: string;
						air_date?: string;
					}>;
				};
				if (ns.episodes?.length > 0) {
					return {
						nextEpisode: { season: afterSeason + 1, episode: 1 },
						nextEpisodeName: ns.episodes[0].name || null,
						nextEpisodeAirDate: ns.episodes[0].air_date || null,
						isComplete: false,
					};
				}
			} catch {}
			return {
				nextEpisode: null,
				nextEpisodeName: null,
				nextEpisodeAirDate: null,
				isComplete: true,
			};
		},
		[seasonData, tmdbId],
	);

	const doMarkSeasonWatched = useCallback(async () => {
		if (!user?.uid || markingSeason) return;
		const eps = episodes;
		if (eps.length === 0) return;

		setMarkingSeason(true);
		try {
			const { nextEpisode, nextEpisodeName, nextEpisodeAirDate, isComplete } =
				await getNextEpisodeInfo(season.season_number);

			await markSeasonWatchedCF(
				tmdbId,
				season.season_number,
				eps.map((ep: TMDBEpisode) => ({
					episodeNumber: ep.episode_number,
					name: ep.name,
					runtime: ep.runtime || 0,
				})),
				nextEpisode,
				isComplete,
				nextEpisodeName,
				nextEpisodeAirDate,
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
	}, [user?.uid, markingSeason, seasonData, tmdbId, season.season_number, getNextEpisodeInfo]);

	const handleMarkSeasonWatched = useCallback(async () => {
		if (guardTracking(doMarkSeasonWatched)) {
			await doMarkSeasonWatched();
		}
	}, [guardTracking, doMarkSeasonWatched]);

	const doMarkEpisodeWatched = useCallback(
		async (ep: TMDBEpisode) => {
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
				const { nextEpisode, nextEpisodeName, nextEpisodeAirDate, isComplete } =
					await getNextEpisodeInfo(season.season_number, ep.episode_number);

				await markEpisodeWatched(
					user.uid,
					tmdbId,
					season.season_number,
					ep.episode_number,
					ep.name,
					ep.runtime || 0,
					nextEpisode,
					isComplete,
					false,
					nextEpisodeName,
					nextEpisodeAirDate,
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
			getNextEpisodeInfo,
			queryClient,
			mutateCachedUpcoming,
			rollbackUpcoming,
		],
	);

	const handleMarkWatched = useCallback(
		async (ep: TMDBEpisode) => {
			if (guardTracking(() => doMarkEpisodeWatched(ep))) {
				await doMarkEpisodeWatched(ep);
			}
		},
		[guardTracking, doMarkEpisodeWatched],
	);

	const handleSheetAction = useCallback(
		async (action: WatchAction) => {
			if (!user?.uid || !sheetTarget) return;

			try {
				if (sheetTarget.type === "episode") {
					const ep = sheetTarget.ep;
					const watched = watchedMap.get(ep.episode_number);
					if (action === "rewatch") {
						await handleMarkWatched(ep);
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
			handleMarkWatched,
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
				const { nextEpisode, nextEpisodeName, nextEpisodeAirDate, isComplete } =
					await getNextEpisodeInfo(season.season_number, toEp);

				await markSeasonWatchedCF(
					tmdbId,
					season.season_number,
					epsToMark.map((ep: TMDBEpisode) => ({
						episodeNumber: ep.episode_number,
						name: ep.name,
						runtime: ep.runtime || 0,
					})),
					nextEpisode,
					isComplete,
					nextEpisodeName,
					nextEpisodeAirDate,
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
		[user?.uid, seasonData, watchedMap, tmdbId, season.season_number, getNextEpisodeInfo],
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
			setEpInfoData({
				showTitle,
				season: season.season_number,
				episode: ep.episode_number,
				episodeTitle: ep.name || null,
				overview: ep.overview || null,
				stillPath: ep.still_path || null,
				airDate: ep.air_date || null,
				runtime: ep.runtime || null,
				showPosterPath,
				showBackdropPath: showBackdropPath ?? null,
			});
			setEpInfoVisible(true);
		},
		[showTitle, season.season_number],
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
			const count = watchedMap.get(ep.episode_number)?.watchCount || 0;
			if (count > 0) {
				handleMarkWatched(ep);
				return;
			}

			if (!isTracked) {
				handleMarkWatched(ep);
				return;
			}

			// Check for skipped unwatched episodes before this one
			const eps = episodes;
			const skipped = eps.filter(
				(e: TMDBEpisode) =>
					e.episode_number < ep.episode_number && !watchedMap.has(e.episode_number),
			);

			if (skipped.length > 0) {
				setSkipModalData({
					firstSkipped: skipped[0].episode_number,
					targetEp: ep,
				});
				setSkipModalVisible(true);
			} else {
				handleMarkWatched(ep);
			}
		},
		[watchedMap, handleMarkWatched, isTracked, episodes],
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

	return (
		<View>
			<TouchableOpacity
				style={styles.seasonRow}
				onPress={() => {
					LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
					setExpanded(!expanded);
				}}
			>
				<Image
					source={{
						uri: `${posterSize.small}${season.poster_path || showPosterPath}`,
					}}
					style={styles.seasonPoster}
					contentFit="cover"
				/>
				<View style={styles.seasonInfo}>
					<Text style={styles.seasonName}>{season.name}</Text>
					<View style={styles.seasonMetaRow}>
						{watchedLoading ? (
							<ActivityIndicator size={10} color={colors.textMuted} style={{ marginRight: 4 }} />
						) : null}
						<Text style={styles.seasonMeta}>
							{watchedLoading ? "" : `${watchedCount}/`}
							{season.episode_count} episodes
							{season.air_date ? ` · ${formatDate(season.air_date)}` : ""}
						</Text>
					</View>
				</View>
				<View style={{ marginRight: spacing.sm }}>
					<CheckmarkButton
						size={30}
						watched={allWatched}
						loading={markingSeason || markingEps.size > 0}
						label={
							allWatched ? `x${minWatchCount}` : partiallyWatched ? `${watchedCount}` : undefined
						}
						labelColor={partiallyWatched ? colors.background : undefined}
						backgroundColor={partiallyWatched ? colors.text : undefined}
						onPress={handleSeasonPress}
						onLongPress={handleSeasonLongPress}
						disabled={markingEps.size > 0 || watchedLoading}
					/>
				</View>
				<Text style={styles.chevron}>{expanded ? "▾" : "›"}</Text>
			</TouchableOpacity>

			{expanded && (
				<View style={styles.episodeList}>
					{isLoading ? (
						<ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
					) : (
						episodes.map((ep: TMDBEpisode) => {
							const watched = watchedMap.get(ep.episode_number);
							const count = watched?.watchCount || 0;
							const isWatched = count > 0;

							const epLabel = `S${String(season.season_number).padStart(2, "0")}E${String(ep.episode_number).padStart(2, "0")}`;

							return (
								<View key={ep.episode_number} style={styles.episodeRow}>
									<TouchableOpacity
										style={styles.episodeInfo}
										onPress={() => handleEpisodePress(ep)}
										onLongPress={() => handleEpisodeLongPress(ep)}
										activeOpacity={0.7}
									>
										<View style={styles.epThumbWrap}>
											{imagesLoading ? (
												<SkeletonLine width={80} height={50} />
											) : ep.still_path ? (
												<Image
													source={{
														uri: `${posterSize.small}${ep.still_path}`,
													}}
													style={styles.epThumb}
													contentFit="cover"
												/>
											) : (
												<View style={styles.epThumbPlaceholder}>
													<Text style={styles.epThumbText}>
														E{String(ep.episode_number).padStart(2, "0")}
													</Text>
												</View>
											)}
										</View>
										<View style={styles.episodeText}>
											<Text style={styles.epLabel}>{epLabel}</Text>
											<Text style={styles.episodeName} numberOfLines={1}>
												{ep.name}
											</Text>
											{ep.air_date && (
												<Text style={styles.episodeMeta}>{formatDate(ep.air_date)}</Text>
											)}
											{count > 1 && (
												<TouchableOpacity
													onPress={() => handleRewatchBadgePress(ep)}
													hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
												>
													<Text style={styles.rewatchBadge}>Watched {count}x</Text>
												</TouchableOpacity>
											)}
										</View>
									</TouchableOpacity>
									<CheckmarkButton
										size={28}
										watched={isWatched}
										loading={markingEps.has(ep.episode_number) || markingSeason}
										label={isWatched ? `x${count}` : undefined}
										onPress={() => handleCheckmarkPress(ep)}
										onLongPress={() => {
											if (isWatched) {
												setSheetTarget({
													type: "episode",
													ep,
													watchCount: count,
												});
												setSheetVisible(true);
											}
										}}
										disabled={markingEps.size > 0 || markingSeason}
									/>
								</View>
							);
						})
					)}
				</View>
			)}

			<WatchActionSheet
				visible={sheetVisible}
				label={sheetLabel}
				watchCount={sheetTarget?.watchCount || 0}
				onSelect={handleSheetAction}
				onClose={() => {
					setSheetVisible(false);
					setSheetTarget(null);
				}}
			/>

			<ConfirmModal
				visible={addModalVisible}
				title="Add to Watchlist?"
				hint="This show isn't in your watchlist yet. Add it to mark episodes as watched."
				error={addModalError}
				confirmLabel="Add & Mark"
				confirmColor={colors.primary}
				loading={addModalLoading}
				onConfirm={handleAddAndMark}
				onClose={() => {
					setAddModalVisible(false);
					pendingAction.current = null;
				}}
			/>

			{skipModalData && (
				<AnimatedModal
					visible={skipModalVisible}
					onClose={() => {
						setSkipModalVisible(false);
						setSkipModalData(null);
					}}
				>
					<View style={styles.skipModalContent}>
						<Text style={styles.skipModalTitle}>Skipped Episodes</Text>
						<Text style={styles.skipModalHint}>
							Mark episodes {skipModalData.firstSkipped}–{skipModalData.targetEp.episode_number} as
							watched?
						</Text>
						<TouchableOpacity
							style={styles.skipModalButton}
							onPress={() => {
								setSkipModalVisible(false);
								markEpisodeRange(skipModalData.firstSkipped, skipModalData.targetEp.episode_number);
								setSkipModalData(null);
							}}
						>
							<Text style={styles.skipModalButtonText}>Mark All Previous</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={styles.skipModalButtonOutline}
							onPress={() => {
								setSkipModalVisible(false);
								handleMarkWatched(skipModalData.targetEp);
								setSkipModalData(null);
							}}
						>
							<Text style={styles.skipModalButtonOutlineText}>Just This One</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={styles.skipModalCancel}
							onPress={() => {
								setSkipModalVisible(false);
								setSkipModalData(null);
							}}
						>
							<Text style={styles.skipModalCancelText}>Cancel</Text>
						</TouchableOpacity>
					</View>
				</AnimatedModal>
			)}

			{epInfoData && (
				<EpisodeDetailModal
					visible={epInfoVisible}
					showTitle={epInfoData.showTitle}
					season={epInfoData.season}
					episode={epInfoData.episode}
					episodeTitle={epInfoData.episodeTitle}
					overview={epInfoData.overview}
					stillPath={epInfoData.stillPath}
					showBackdropPath={epInfoData.showBackdropPath}
					showPosterPath={epInfoData.showPosterPath}
					airDate={epInfoData.airDate}
					runtime={epInfoData.runtime}
					onClose={() => {
						setEpInfoVisible(false);
						setEpInfoData(null);
					}}
				/>
			)}
		</View>
	);
});

const styles = StyleSheet.create({
	seasonRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: spacing.sm,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
	},
	seasonPoster: {
		width: 45,
		height: 67,
		borderRadius: 4,
	},
	seasonInfo: {
		flex: 1,
		marginLeft: spacing.md,
	},
	seasonName: {
		...typography.subtitle,
		fontSize: 14,
	},
	seasonMetaRow: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: spacing.xs,
	},
	seasonMeta: {
		...typography.caption,
	},
	chevron: {
		...typography.title,
		color: colors.textMuted,
		fontSize: 18,
	},
	episodeList: {
		backgroundColor: colors.surface,
		borderRadius: 8,
		marginBottom: spacing.sm,
	},
	loader: {
		paddingVertical: spacing.lg,
	},
	episodeRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingRight: spacing.md,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
	},
	episodeInfo: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
	},
	epThumbWrap: {
		width: 80,
		height: 50,
		marginRight: spacing.md,
	},
	epThumb: {
		width: 80,
		height: 50,
	},
	epThumbPlaceholder: {
		width: 80,
		height: 50,
		backgroundColor: colors.surfaceLight,
		justifyContent: "center",
		alignItems: "center",
	},
	epThumbText: {
		fontSize: 11,
		fontWeight: "600",
		color: colors.textMuted,
	},
	episodeText: {
		flex: 1,
		marginLeft: spacing.sm,
	},
	epLabel: {
		...typography.caption,
		fontSize: 10,
		color: colors.textMuted,
		letterSpacing: 0.5,
		marginBottom: 1,
	},
	episodeName: {
		...typography.body,
		fontSize: 13,
	},
	episodeMeta: {
		...typography.caption,
		marginTop: 2,
		fontSize: 11,
	},
	rewatchBadge: {
		...typography.caption,
		color: colors.accent,
		marginTop: 2,
		fontSize: 11,
	},
	skipModalContent: {
		backgroundColor: colors.surface,
		borderRadius: 12,
		padding: spacing.lg,
	},
	skipModalTitle: {
		...typography.subtitle,
		fontSize: 16,
		textAlign: "center",
		marginBottom: spacing.sm,
	},
	skipModalHint: {
		...typography.caption,
		color: colors.textSecondary,
		textAlign: "center",
		marginBottom: spacing.lg,
	},
	skipModalButton: {
		backgroundColor: colors.primary,
		paddingVertical: spacing.md,
		borderRadius: 8,
		alignItems: "center",
	},
	skipModalButtonText: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.text,
	},
	skipModalButtonOutline: {
		paddingVertical: spacing.md,
		borderRadius: 8,
		alignItems: "center",
		borderWidth: 1.5,
		borderColor: colors.text,
		marginTop: spacing.sm,
	},
	skipModalButtonOutlineText: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.text,
	},
	skipModalCancel: {
		paddingVertical: spacing.sm,
		alignItems: "center",
		marginTop: spacing.sm,
	},
	skipModalCancelText: {
		...typography.caption,
		color: colors.textMuted,
	},
});
