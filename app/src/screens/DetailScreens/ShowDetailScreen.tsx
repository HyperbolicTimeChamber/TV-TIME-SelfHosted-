import React, { useCallback, useEffect, useState } from "react";
import {
	View,
	Text,
	Animated,
	TouchableOpacity,
	StyleSheet,
	Alert,
	ActivityIndicator,
	NativeScrollEvent,
	NativeSyntheticEvent,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useRoute, RouteProp } from "@react-navigation/native";
import { getFirestore, doc, getDoc, onSnapshot, updateDoc } from "@react-native-firebase/firestore";
import {
	useShowDetails,
	useUpcomingMutations,
	removeShowFromCalendarGlobal,
	addMovieToCalendarGlobal,
	incrementDailyWatch,
	decrementDailyWatch,
} from "../../hooks";
import { useAuthStore } from "../../stores";
import {
	addToTracking,
	removeFromTracking,
	startRewatch,
	resumeWatching,
	resumeRewatch,
	markMovieWatched,
	decrementMovieWatchCount,
	unmarkMovieWatched,
	addAndMarkMovieWatched,
} from "../../services";
import { warmupShowDetailCFs } from "../../services/warmup";
import {
	ConfirmModal,
	LoadingSpinner,
	SeasonDropdown,
	UnreleasedMovieModal,
	shouldShowUnreleasedModal,
	WatchActionSheet,
} from "../../components";
import type { WatchAction } from "../../components";
import { emitShowAdded, emitShowRemoved, emitShowCompleted } from "../../utils/watchlistEvents";
import { showDocId } from "../../utils/docId";
import { colors, spacing, typography, posterSize, backdropSize } from "../../theme";
import {
	HomeStackParamList,
	WatchStatus,
	MediaType,
	UpcomingEpisode,
	QueryKey,
	WatchedMovie,
} from "../../types";
import { useQueryClient } from "@tanstack/react-query";
import { Timestamp } from "@react-native-firebase/firestore";

type RouteParams = RouteProp<HomeStackParamList, "ShowDetail">;

export default function ShowDetailScreen() {
	const route = useRoute<RouteParams>();
	const { tmdbId, mediaType } = route.params;
	const user = useAuthStore((s) => s.user);

	const navigation = useNavigation();
	const insets = useSafeAreaInsets();
	const BACKDROP_HEIGHT = 350;
	const [imageTranslateY, setImageTranslateY] = useState(0);
	const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
		const y = e.nativeEvent.contentOffset.y;
		setImageTranslateY(Math.min(y * 0.4, BACKDROP_HEIGHT * 0.5));
	}, []);

	useEffect(() => {
		warmupShowDetailCFs();
	}, []);
	const {
		data: show,
		isLoading,
		isError,
		error,
		episodesBySeason,
	} = useShowDetails(tmdbId, mediaType);
	const [watchlistItem, setWatchlistItem] = useState<any>(null);
	const [trackingLoading, setTrackingLoading] = useState(true);
	const [adding, setAdding] = useState(false);
	const [removing, setRemoving] = useState(false);
	const { addShowToUpcoming, removeShowFromUpcoming } = useUpcomingMutations();
	const queryClient = useQueryClient();
	const [movieWatchCount, setMovieWatchCount] = useState(() => {
		if (mediaType !== MediaType.MOVIE || !user?.uid) return 0;
		const cached = queryClient.getQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid]);
		if (!cached?.pages) return 0;
		const found = cached.pages.flatMap((p: any) => p.movies).find((m: any) => m.tmdbId === tmdbId);
		return found?.watchCount ?? 0;
	});
	const [movieSheetVisible, setMovieSheetVisible] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);
	const [removeModalVisible, setRemoveModalVisible] = useState(false);
	const [removeError, setRemoveError] = useState<string | null>(null);
	const [unreleasedModal, setUnreleasedModal] = useState<{
		title: string;
	} | null>(null);

	useEffect(() => {
		if (!user?.uid) {
			setTrackingLoading(false);
			return;
		}
		const db = getFirestore();
		const trackingDocRef = doc(db, "users", user.uid, "tracking", showDocId(tmdbId, mediaType));

		// One-time read + listener for real-time updates after add/remove
		let cancelled = false;
		getDoc(trackingDocRef)
			.then((snap) => {
				if (cancelled) return;
				if (snap.exists()) {
					const data: any = { id: snap.id, ...snap.data() };
					if (
						mediaType === MediaType.TV &&
						data.status === WatchStatus.WATCHING &&
						!data.nextEpisode
					) {
						updateDoc(trackingDocRef, { status: WatchStatus.COMPLETED }).catch(() => {});
					}
					setWatchlistItem(data);
				} else {
					setWatchlistItem(null);
				}
				setTrackingLoading(false);
			})
			.catch(() => {
				if (!cancelled) setTrackingLoading(false);
			});

		// Listener for live updates (add/remove while on screen)
		const unsubscribe = onSnapshot(trackingDocRef, (snap) => {
			if (snap.exists()) {
				setWatchlistItem({ id: snap.id, ...snap.data() });
			} else {
				setWatchlistItem(null);
			}
		});

		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [user?.uid, tmdbId]);

	const title = show?.name || show?.title || "";
	const rawDate = show?.first_air_date || show?.release_date || "";
	const year =
		mediaType === MediaType.MOVIE && rawDate.length >= 10
			? new Date(rawDate).toLocaleDateString("en-US", {
					month: "long",
					day: "numeric",
					year: "numeric",
				})
			: rawDate.substring(0, 4);

	const directors =
		show?.credits?.crew?.filter((c) => c.job === "Director").map((c) => c.name) ?? [];
	const writers =
		show?.credits?.crew?.filter((c) => c.department === "Writing").map((c) => c.name) ?? [];
	const producers =
		show?.credits?.crew?.filter((c) => c.job === "Producer").map((c) => c.name) ?? [];

	const handleAddToWatchlist = useCallback(async () => {
		if (!user?.uid || !show || adding) return;
		setAdding(true);
		try {
			const releaseDate = show.release_date || null;
			const today = new Date().toISOString().split("T")[0];
			const isUnreleased = mediaType === MediaType.MOVIE && releaseDate && releaseDate > today;

			if (isUnreleased) {
				shouldShowUnreleasedModal(user.uid).then((shouldShow) => {
					if (shouldShow) {
						setUnreleasedModal({ title: show.title || show.name || "" });
					}
				});
			}

			// Get first episode info for TV shows
			const firstEp = mediaType === MediaType.TV ? episodesBySeason.get(1)?.[0] : undefined;

			await addToTracking(user.uid, tmdbId, mediaType, isUnreleased ? releaseDate : null, {
				title: show.title || show.name || "",
				posterPath: show.poster_path || null,
				nextEpisodeName: firstEp?.name || null,
				nextEpisodeAirDate: firstEp?.air_date || null,
			});
			const title = show.title || show.name || "";
			const poster = show.poster_path || null;
			const now = Timestamp.now();
			emitShowAdded({
				id: showDocId(tmdbId, mediaType),
				tmdbId,
				mediaType,
				status: WatchStatus.WATCHING,
				nextEpisode: mediaType === MediaType.TV ? { season: 1, episode: 1 } : null,
				nextEpisodeName: firstEp?.name || null,
				nextEpisodeAirDate: firstEp?.air_date || null,
				rewatchCount: 0,
				addedAt: now,
				lastWatchedAt: now,
				priorityDate: now,
				releaseDate: releaseDate ?? null,
				title,
				posterPath: poster,
				totalEpisodes: 0,
				catalogShow: null,
			});
			if (isUnreleased && releaseDate) {
				const movieEp: UpcomingEpisode = {
					tmdbShowId: tmdbId,
					showTitle: title,
					posterPath: poster,
					season: 0,
					episode: 0,
					episodeTitle: title,
					airDate: releaseDate,
					runtime: null,
					mediaType: MediaType.MOVIE,
				};
				addShowToUpcoming(tmdbId, movieEp);
				addMovieToCalendarGlobal(movieEp);
			} else if (mediaType === MediaType.TV) {
				const upcomingEps: UpcomingEpisode[] = [];
				for (const [seasonNum, eps] of episodesBySeason) {
					if (seasonNum === 0) continue;
					for (const ep of eps) {
						if (ep.air_date && ep.air_date >= today) {
							upcomingEps.push({
								tmdbShowId: tmdbId,
								showTitle: title,
								posterPath: poster,
								season: seasonNum,
								episode: ep.episode_number,
								episodeTitle: ep.name || "",
								airDate: ep.air_date,
								runtime: ep.runtime ?? null,
								mediaType: MediaType.TV,
							});
						}
					}
				}
				if (upcomingEps.length > 0) {
					addShowToUpcoming(tmdbId, upcomingEps);
					for (const ep of upcomingEps) {
						addMovieToCalendarGlobal(ep);
					}
				}
				// No ep data → don't add to upcoming. syncCatalog CF will populate later.
			}
		} catch (err: any) {
			console.error("addToTracking failed:", err);
			Alert.alert("Error", err.message || "Failed to add to watchlist.");
		} finally {
			setAdding(false);
		}
	}, [user?.uid, show, tmdbId, mediaType, adding, addShowToUpcoming, episodesBySeason]);

	const handleRemove = useCallback(() => {
		if (!user?.uid || removing) return;
		setRemoveError(null);
		setRemoveModalVisible(true);
	}, [user?.uid, removing]);

	const handleConfirmRemove = useCallback(async () => {
		if (!user?.uid || removing) return;
		setRemoving(true);
		setRemoveError(null);
		try {
			await removeFromTracking(user.uid, tmdbId, mediaType);
			removeShowFromUpcoming(tmdbId);
			removeShowFromCalendarGlobal(tmdbId);
			emitShowRemoved(tmdbId);
			setRemoveModalVisible(false);
		} catch (err: any) {
			console.error("removeFromTracking failed:", err);
			setRemoveError(err.message || "Failed to remove. Please try again.");
		} finally {
			setRemoving(false);
		}
	}, [user?.uid, tmdbId, removing, removeShowFromUpcoming]);

	const handleMarkMovieWatched = useCallback(async () => {
		if (!user?.uid || !show || adding) return;
		setAdding(true);
		try {
			const movieTitle = show.title || show.name || "";
			const moviePoster = show.poster_path || null;
			if (!watchlistItem) {
				await addAndMarkMovieWatched(user.uid, tmdbId, show.runtime ?? 0, {
					title: movieTitle,
					posterPath: moviePoster,
				});
				// Notify trackedIds so search card shows ✓
				emitShowAdded({
					id: showDocId(tmdbId, MediaType.MOVIE),
					tmdbId,
					mediaType: MediaType.MOVIE,
					status: WatchStatus.COMPLETED,
					nextEpisode: null,
					nextEpisodeName: null,
					nextEpisodeAirDate: null,
					rewatchCount: 0,
					addedAt: Timestamp.now(),
					lastWatchedAt: Timestamp.now(),
					priorityDate: Timestamp.now(),
					releaseDate: show.release_date ?? null,
					title: movieTitle,
					posterPath: moviePoster,
					totalEpisodes: 0,
					catalogShow: null,
				});
			} else {
				await markMovieWatched(user.uid, tmdbId, show.runtime ?? 0);
			}
			// Update query cache directly — no refetch
			const now = Timestamp.now();
			queryClient.setQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid], (old: any) => {
				if (!old?.pages) return old;
				const newMovie = {
					id: `${tmdbId}_watched`,
					tmdbId,
					watchedAt: now,
					lastWatchedAt: now,
					runtime: show.runtime ?? 0,
					watchCount: 1,
					title: movieTitle,
					posterPath: moviePoster,
				} as WatchedMovie;
				const firstPage = old.pages[0];
				return {
					...old,
					pages: [{ ...firstPage, movies: [newMovie, ...firstPage.movies] }, ...old.pages.slice(1)],
				};
			});
			setMovieWatchCount((c: number) => c + 1);
			incrementDailyWatch("movie");
			emitShowCompleted({
				tmdbId,
				mediaType: MediaType.MOVIE,
				title: movieTitle,
				posterPath: moviePoster,
				genres: [],
			});
		} catch (err: any) {
			Alert.alert("Error", err.message || "Failed to mark movie as watched.");
		} finally {
			setAdding(false);
		}
	}, [user?.uid, show, tmdbId, watchlistItem, adding, queryClient]);

	const handleResumeOrRewatch = useCallback(async () => {
		if (!user?.uid) return;
		if (mediaType === MediaType.MOVIE && watchlistItem?.status === WatchStatus.COMPLETED) {
			await handleMarkMovieWatched();
			return;
		}
		if (watchlistItem?.status === WatchStatus.PAUSED) {
			await resumeWatching(user.uid, tmdbId, mediaType);
		} else if (watchlistItem?.status === WatchStatus.PAUSED_REWATCH) {
			await resumeRewatch(user.uid, tmdbId, mediaType);
		} else {
			await startRewatch(user.uid, tmdbId, mediaType);
		}
	}, [user?.uid, tmdbId, watchlistItem?.status, mediaType, handleMarkMovieWatched]);

	const handleMovieSheetAction = useCallback(
		async (action: WatchAction) => {
			if (!user?.uid || !show) return;
			const runtime = show.runtime ?? 0;
			if (action === "rewatch") {
				await handleMarkMovieWatched();
			} else if (action === "watched_once_less") {
				await decrementMovieWatchCount(user.uid, tmdbId, runtime, movieWatchCount);
				if (movieWatchCount <= 1) {
					// Fully unwatched — remove from cache
					queryClient.setQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid], (old: any) => {
						if (!old?.pages) return old;
						return {
							...old,
							pages: old.pages.map((p: any) => ({
								...p,
								movies: p.movies.filter((m: any) => m.tmdbId !== tmdbId),
							})),
						};
					});
					setMovieWatchCount(0);
				} else {
					queryClient.setQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid], (old: any) => {
						if (!old?.pages) return old;
						return {
							...old,
							pages: old.pages.map((p: any) => ({
								...p,
								movies: p.movies.map((m: any) =>
									m.tmdbId === tmdbId ? { ...m, watchCount: (m.watchCount || 1) - 1 } : m,
								),
							})),
						};
					});
					setMovieWatchCount((c: number) => c - 1);
				}
				decrementDailyWatch("movie");
			} else if (action === "not_watched") {
				await unmarkMovieWatched(user.uid, tmdbId, runtime);
				queryClient.setQueryData<any>([QueryKey.WATCHED_MOVIES, user.uid], (old: any) => {
					if (!old?.pages) return old;
					return {
						...old,
						pages: old.pages.map((p: any) => ({
							...p,
							movies: p.movies.filter((m: any) => m.tmdbId !== tmdbId),
						})),
					};
				});
				setMovieWatchCount(0);
				decrementDailyWatch("movie");
			}
		},
		[user?.uid, show, tmdbId, movieWatchCount, queryClient, handleMarkMovieWatched],
	);

	if (isLoading || trackingLoading) {
		return (
			<View style={styles.center}>
				<LoadingSpinner />
			</View>
		);
	}

	if (isError || !show) {
		return (
			<View style={styles.center}>
				<Text style={styles.errorText}>
					{isError ? (error as any)?.message || "Failed to load show" : "Show not found"}
				</Text>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			{/* Floating back button */}
			<TouchableOpacity
				style={[styles.backButton, { top: insets.top + 8 }]}
				onPress={() => navigation.goBack()}
				hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
			>
				<Ionicons name="chevron-back" size={26} color={colors.text} />
			</TouchableOpacity>

			{/* Share button - commented out for later */}
			{/* <TouchableOpacity
				style={[styles.shareButton, { top: insets.top + 8 }]}
				onPress={() => {}}
				hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
			>
				<Ionicons name="share-outline" size={22} color={colors.text} />
			</TouchableOpacity> */}

			<Animated.ScrollView
				contentContainerStyle={{ paddingBottom: spacing.xxl + Math.max(insets.bottom, 48) }}
				onScroll={handleScroll}
				scrollEventThrottle={16}
			>
				{/* Backdrop */}
				<View style={[styles.backdrop, { height: BACKDROP_HEIGHT }]}>
					<View style={[StyleSheet.absoluteFill, styles.backdropSkeleton]} />
					<Image
						source={{
							uri: show.backdrop_path
								? `${backdropSize.medium}${show.backdrop_path}`
								: `${posterSize.large}${show.poster_path}`,
						}}
						style={[StyleSheet.absoluteFill, { transform: [{ translateY: imageTranslateY }] }]}
						contentFit="cover"
						transition={300}
					/>
				</View>

				{/* Content overlaps backdrop — gradient fades image into island */}
				<LinearGradient
					colors={["transparent", "rgba(13,13,13,0.7)", colors.background]}
					locations={[0, 0.6, 0.9]}
					style={[styles.gradientIsland, { marginTop: -280 }]}
				>
					<BlurView intensity={15} tint="light" style={styles.island}>
						<Text style={styles.islandTitle}>{title}</Text>
						<Text style={styles.islandMeta}>
							{year}
							{mediaType === MediaType.TV && show.number_of_seasons
								? ` \u00b7 ${show.number_of_seasons} Season${show.number_of_seasons > 1 ? "s" : ""}`
								: ""}
							{mediaType === MediaType.MOVIE && show.runtime
								? ` \u00b7 ${Math.floor(show.runtime / 60)}h ${show.runtime % 60}m`
								: ""}
							{show.vote_average ? ` \u00b7 \u2605 ${show.vote_average.toFixed(1)}` : ""}
						</Text>

						{/* Action pills */}
						<View style={styles.pillRow}>
							{!watchlistItem ? (
								<>
									<TouchableOpacity
										style={[styles.pill, styles.pillPrimary, adding && styles.pillDisabled]}
										onPress={handleAddToWatchlist}
										disabled={adding}
									>
										{adding ? (
											<ActivityIndicator size="small" color={colors.text} />
										) : (
											<Text style={styles.pillText}>+ Add to Watchlist</Text>
										)}
									</TouchableOpacity>
									{mediaType === MediaType.MOVIE && (
										<TouchableOpacity
											style={[styles.pill, styles.pillWatched, adding && styles.pillDisabled]}
											onPress={handleMarkMovieWatched}
											disabled={adding}
										>
											{adding ? (
												<ActivityIndicator size="small" color={colors.text} />
											) : (
												<Text style={styles.pillText}>Watched</Text>
											)}
										</TouchableOpacity>
									)}
								</>
							) : (
								<>
									{mediaType === MediaType.MOVIE &&
										watchlistItem.status !== WatchStatus.COMPLETED && (
											<TouchableOpacity
												style={[styles.pill, styles.pillWatched, adding && styles.pillDisabled]}
												onPress={handleMarkMovieWatched}
												disabled={adding}
											>
												{adding ? (
													<ActivityIndicator size="small" color={colors.text} />
												) : (
													<Text style={styles.pillText}>Mark as Watched</Text>
												)}
											</TouchableOpacity>
										)}
									{mediaType === MediaType.MOVIE &&
										watchlistItem.status === WatchStatus.COMPLETED && (
											<View style={[styles.pill, styles.pillWatched, { opacity: 0.7 }]}>
												<Text style={styles.pillText}>
													Watched{movieWatchCount > 0 ? ` ${movieWatchCount}x` : ""} {"\u2713"}
												</Text>
											</View>
										)}
									{(watchlistItem.status === WatchStatus.COMPLETED ||
										watchlistItem.status === WatchStatus.PAUSED ||
										watchlistItem.status === WatchStatus.PAUSED_REWATCH ||
										(watchlistItem.status === WatchStatus.WATCHING &&
											mediaType === MediaType.TV &&
											!watchlistItem.nextEpisode)) && (
										<TouchableOpacity
											style={[styles.pill, styles.pillAccent]}
											onPress={handleResumeOrRewatch}
											onLongPress={
												mediaType === MediaType.MOVIE && movieWatchCount > 0
													? () => setMovieSheetVisible(true)
													: undefined
											}
										>
											<Text style={styles.pillText}>
												{watchlistItem.status === WatchStatus.PAUSED
													? "Resume"
													: watchlistItem.status === WatchStatus.PAUSED_REWATCH
														? "Resume Rewatch"
														: "Rewatch"}
											</Text>
										</TouchableOpacity>
									)}
									<TouchableOpacity
										style={[styles.pill, styles.pillRemove, removing && styles.pillDisabled]}
										onPress={handleRemove}
										disabled={removing}
									>
										{removing ? (
											<ActivityIndicator size="small" color={colors.destructiveRed} />
										) : (
											<Text style={styles.pillRemoveText}>Remove</Text>
										)}
									</TouchableOpacity>
								</>
							)}
						</View>
					</BlurView>
				</LinearGradient>

				{/* Content area */}
				<View style={styles.content}>
					{/* Overview */}
					<Text style={styles.overview}>{show.overview}</Text>

					{/* Credits — movies only */}
					{mediaType === MediaType.MOVIE &&
						(directors.length > 0 || writers.length > 0 || producers.length > 0) && (
							<View style={styles.creditsSection}>
								{directors.length > 0 && (
									<View style={styles.creditBlock}>
										<Text style={styles.creditLabel}>Director</Text>
										<Text style={styles.creditNames}>{directors.join(", ")}</Text>
									</View>
								)}
								{writers.length > 0 && (
									<View style={styles.creditBlock}>
										<Text style={styles.creditLabel}>Screenplay</Text>
										<Text style={styles.creditNames}>{writers.join(", ")}</Text>
									</View>
								)}
								{producers.length > 0 && (
									<View style={styles.creditBlock}>
										<Text style={styles.creditLabel}>Production</Text>
										<Text style={styles.creditNames}>{producers.join(", ")}</Text>
									</View>
								)}
							</View>
						)}

					{/* Seasons — TV only */}
					{mediaType === MediaType.TV && show.seasons && (
						<View style={styles.seasonsSection}>
							<Text style={styles.sectionTitle}>Seasons</Text>
							{show.seasons
								.filter((s) => s.season_number > 0)
								?.map((season) => (
									<SeasonDropdown
										key={season.season_number}
										tmdbId={tmdbId}
										season={season}
										showTitle={title}
										showPosterPath={show.poster_path}
										showBackdropPath={show.backdrop_path || null}
										isTracked={!!watchlistItem}
										preloadedEpisodes={episodesBySeason.get(season.season_number)}
										refreshKey={refreshKey}
									/>
								))}
						</View>
					)}
				</View>
			</Animated.ScrollView>

			<ConfirmModal
				visible={removeModalVisible}
				title={`Remove "${title}"?`}
				hint="This will remove it from your watchlist. Your watch history will be kept."
				error={removeError}
				confirmLabel="Remove"
				loading={removing}
				onConfirm={handleConfirmRemove}
				onClose={() => {
					setRemoveModalVisible(false);
					setRemoveError(null);
				}}
			/>

			<UnreleasedMovieModal
				visible={!!unreleasedModal}
				onClose={() => setUnreleasedModal(null)}
				movieTitle={unreleasedModal?.title ?? ""}
			/>

			<WatchActionSheet
				visible={movieSheetVisible}
				label={show?.title || show?.name || "Movie"}
				watchCount={movieWatchCount}
				onSelect={handleMovieSheetAction}
				onClose={() => setMovieSheetVisible(false)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	center: {
		flex: 1,
		backgroundColor: colors.background,
		justifyContent: "center",
		alignItems: "center",
	},
	errorText: {
		...typography.body,
		color: colors.textSecondary,
	},
	backdrop: {
		overflow: "hidden",
	},
	backdropSkeleton: {
		backgroundColor: colors.surfaceLight,
	},
	backButton: {
		position: "absolute",
		left: 16,
		zIndex: 10,
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: colors.badgeOverlay,
		alignItems: "center",
		justifyContent: "center",
		paddingRight: 2,
	},
	shareButton: {
		position: "absolute",
		right: 16,
		zIndex: 10,
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: colors.badgeOverlay,
		alignItems: "center",
		justifyContent: "center",
	},
	gradientIsland: {
		paddingHorizontal: spacing.lg,
		paddingTop: 180,
		paddingBottom: spacing.md,
	},
	island: {
		backgroundColor: "rgba(0,0,0,0.25)",
		borderRadius: 20,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.lg,
		overflow: "hidden",
	},
	islandTitle: {
		...typography.title,
		fontSize: 24,
	},
	islandMeta: {
		...typography.caption,
		marginTop: spacing.xs,
	},
	content: {
		backgroundColor: colors.background,
		paddingHorizontal: spacing.lg,
		paddingTop: spacing.sm,
	},
	pillRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
		marginTop: spacing.md,
	},
	pill: {
		flex: 1,
		minWidth: 100,
		paddingVertical: spacing.sm,
		paddingHorizontal: spacing.md,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	pillPrimary: {
		backgroundColor: colors.primary,
	},
	pillWatched: {
		backgroundColor: colors.watchedGreen,
	},
	pillAccent: {
		backgroundColor: colors.accent,
	},
	pillRemove: {
		backgroundColor: "transparent",
		borderWidth: 1.5,
		borderColor: colors.destructiveRed,
	},
	pillDisabled: {
		opacity: 0.6,
	},
	pillText: {
		...typography.subtitle,
		fontSize: 13,
		color: colors.text,
	},
	pillRemoveText: {
		...typography.subtitle,
		fontSize: 13,
		color: colors.destructiveRed,
	},
	overview: {
		...typography.body,
		color: colors.textSecondary,
		lineHeight: 22,
		textAlign: "justify",
		paddingHorizontal: spacing.sm,
	},
	creditsSection: {
		marginTop: spacing.xl,
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.lg,
		paddingHorizontal: spacing.sm,
	},
	creditBlock: {
		minWidth: 100,
	},
	creditLabel: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.primary,
		marginBottom: spacing.xs,
	},
	creditNames: {
		...typography.body,
		color: colors.textSecondary,
	},
	seasonsSection: {
		marginTop: spacing.xl,
	},
	sectionTitle: {
		...typography.title,
		fontSize: 18,
		marginBottom: spacing.md,
	},
});
