import React, { useCallback, useEffect, useState } from "react";
import {
	View,
	Text,
	ScrollView,
	TouchableOpacity,
	StyleSheet,
	Alert,
	ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useRoute, RouteProp } from "@react-navigation/native";
import {
	getFirestore,
	doc,
	getDoc,
	onSnapshot,
	updateDoc,
} from "@react-native-firebase/firestore";
import {
	useShowDetails,
	useUpcomingMutations,
	removeShowFromCalendarGlobal,
	addMovieToCalendarGlobal,
} from "../hooks";
import { useAuthStore } from "../stores";
import {
	addToTracking,
	removeFromTracking,
	startRewatch,
	resumeWatching,
	resumeRewatch,
	markMovieWatched,
	addAndMarkMovieWatched,
} from "../services";
import { warmupShowDetailCFs } from "../services/warmup";
import {
	ConfirmModal,
	LoadingSpinner,
	SeasonDropdown,
	UnreleasedMovieModal,
	shouldShowUnreleasedModal,
} from "../components";
import { emitShowAdded, emitShowRemoved } from "../utils/watchlistEvents";
import { showDocId } from "../utils/docId";
import { colors, spacing, typography, posterSize } from "../theme";
import {
	HomeStackParamList,
	WatchStatus,
	MediaType,
	UpcomingEpisode,
	QueryKey,
	WatchedMovie,
} from "../types";
import { useQueryClient } from "@tanstack/react-query";
import { Timestamp } from "@react-native-firebase/firestore";

type RouteParams = RouteProp<HomeStackParamList, "ShowDetail">;

export default function ShowDetailScreen() {
	const route = useRoute<RouteParams>();
	const { tmdbId, mediaType } = route.params;
	const user = useAuthStore((s) => s.user);

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
		const trackingDocRef = doc(
			db,
			"users",
			user.uid,
			"tracking",
			showDocId(tmdbId, mediaType),
		);

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
						updateDoc(trackingDocRef, { status: WatchStatus.COMPLETED }).catch(
							() => {},
						);
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

	const handleAddToWatchlist = useCallback(async () => {
		if (!user?.uid || !show || adding) return;
		setAdding(true);
		try {
			const releaseDate = show.release_date || null;
			const today = new Date().toISOString().split("T")[0];
			const isUnreleased =
				mediaType === MediaType.MOVIE && releaseDate && releaseDate > today;

			if (isUnreleased) {
				shouldShowUnreleasedModal(user.uid).then((shouldShow) => {
					if (shouldShow) {
						setUnreleasedModal({ title: show.title || show.name || "" });
					}
				});
			}

			// Get first episode info for TV shows
			const firstEp =
				mediaType === MediaType.TV ? episodesBySeason.get(1)?.[0] : undefined;

			await addToTracking(
				user.uid,
				tmdbId,
				mediaType,
				isUnreleased ? releaseDate : null,
				{
					title: show.title || show.name || "",
					posterPath: show.poster_path || null,
					nextEpisodeName: firstEp?.name || null,
					nextEpisodeAirDate: firstEp?.air_date || null,
				},
			);
			const title = show.title || show.name || "";
			const poster = show.poster_path || null;
			const now = Timestamp.now();
			emitShowAdded({
				id: showDocId(tmdbId, mediaType),
				tmdbId,
				mediaType,
				status: WatchStatus.WATCHING,
				nextEpisode:
					mediaType === MediaType.TV ? { season: 1, episode: 1 } : null,
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
	}, [
		user?.uid,
		show,
		tmdbId,
		mediaType,
		adding,
		addShowToUpcoming,
		episodesBySeason,
	]);

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

	const handleResumeOrRewatch = useCallback(async () => {
		if (!user?.uid) return;
		if (watchlistItem?.status === WatchStatus.PAUSED) {
			await resumeWatching(user.uid, tmdbId, mediaType);
		} else if (watchlistItem?.status === WatchStatus.PAUSED_REWATCH) {
			await resumeRewatch(user.uid, tmdbId, mediaType);
		} else {
			await startRewatch(user.uid, tmdbId, mediaType);
		}
	}, [user?.uid, tmdbId, watchlistItem?.status]);

	const handleMarkMovieWatched = useCallback(async () => {
		if (!user?.uid || !show || adding) return;
		setAdding(true);
		try {
			if (!watchlistItem) {
				await addAndMarkMovieWatched(user.uid, tmdbId, show.runtime ?? 0, {
					title: show.title || show.name || "",
					posterPath: show.poster_path || null,
				});
			} else {
				await markMovieWatched(user.uid, tmdbId, show.runtime ?? 0);
			}
			// Update query cache directly — no refetch
			const now = Timestamp.now();
			queryClient.setQueryData<any>(
				[QueryKey.WATCHED_MOVIES, user.uid],
				(old: any) => {
					if (!old?.pages) return old;
					const newMovie = {
						id: `${tmdbId}_watched`,
						tmdbId,
						watchedAt: now,
						lastWatchedAt: now,
						runtime: show.runtime ?? 0,
						watchCount: 1,
						title: show.title || show.name || "",
						posterPath: show.poster_path || null,
					} as WatchedMovie;
					const firstPage = old.pages[0];
					return {
						...old,
						pages: [
							{ ...firstPage, movies: [newMovie, ...firstPage.movies] },
							...old.pages.slice(1),
						],
					};
				},
			);
		} catch (err: any) {
			Alert.alert("Error", err.message || "Failed to mark movie as watched.");
		} finally {
			setAdding(false);
		}
	}, [user?.uid, show, tmdbId, watchlistItem, adding, queryClient]);

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
					{isError
						? (error as any)?.message || "Failed to load show"
						: "Show not found"}
				</Text>
			</View>
		);
	}

	return (
		<ScrollView style={styles.container}>
			<Image
				source={{
					uri: `${posterSize.large}${show.backdrop_path || show.poster_path}`,
				}}
				style={styles.backdrop}
				contentFit="cover"
			/>

			<View style={styles.content}>
				<Text style={styles.title}>{title}</Text>
				<Text style={styles.meta}>
					{year}
					{show.number_of_seasons
						? ` · ${show.number_of_seasons} Season${show.number_of_seasons > 1 ? "s" : ""}`
						: ""}
					{show.vote_average ? ` · ★ ${show.vote_average.toFixed(1)}` : ""}
				</Text>

				<View style={styles.actions}>
					{!watchlistItem ? (
						<>
							<TouchableOpacity
								style={[styles.addButton, adding && { opacity: 0.6 }]}
								onPress={handleAddToWatchlist}
								disabled={adding}>
								{adding ? (
									<ActivityIndicator size="small" color={colors.text} />
								) : (
									<Text style={styles.buttonText}>+ Add to Watchlist</Text>
								)}
							</TouchableOpacity>
							{mediaType === MediaType.MOVIE && (
								<TouchableOpacity
									style={[
										styles.addButton,
										{ backgroundColor: colors.watchedGreen },
										adding && { opacity: 0.6 },
									]}
									onPress={handleMarkMovieWatched}
									disabled={adding}>
									{adding ? (
										<ActivityIndicator size="small" color={colors.text} />
									) : (
										<Text style={styles.buttonText}>Watched</Text>
									)}
								</TouchableOpacity>
							)}
						</>
					) : (
						<>
							{mediaType === MediaType.MOVIE &&
								watchlistItem.status !== WatchStatus.COMPLETED && (
									<TouchableOpacity
										style={[
											styles.addButton,
											{ backgroundColor: colors.watchedGreen },
											adding && { opacity: 0.6 },
										]}
										onPress={handleMarkMovieWatched}
										disabled={adding}>
										{adding ? (
											<ActivityIndicator size="small" color={colors.text} />
										) : (
											<Text style={styles.buttonText}>Mark as Watched</Text>
										)}
									</TouchableOpacity>
								)}
							{mediaType === MediaType.MOVIE &&
								watchlistItem.status === WatchStatus.COMPLETED && (
									<View
										style={[
											styles.addButton,
											{ backgroundColor: colors.watchedGreen, opacity: 0.7 },
										]}>
										<Text style={styles.buttonText}>Watched ✓</Text>
									</View>
								)}
							{(watchlistItem.status === WatchStatus.COMPLETED ||
								watchlistItem.status === WatchStatus.PAUSED ||
								watchlistItem.status === WatchStatus.PAUSED_REWATCH ||
								(watchlistItem.status === WatchStatus.WATCHING &&
									mediaType === MediaType.TV &&
									!watchlistItem.nextEpisode)) && (
								<TouchableOpacity
									style={[styles.addButton, { backgroundColor: colors.accent }]}
									onPress={handleResumeOrRewatch}>
									<Text style={styles.buttonText}>
										{watchlistItem.status === WatchStatus.PAUSED
											? "Resume"
											: watchlistItem.status === WatchStatus.PAUSED_REWATCH
												? "Resume Rewatch"
												: "Rewatch"}
									</Text>
								</TouchableOpacity>
							)}
							<TouchableOpacity
								style={[styles.removeButton, removing && { opacity: 0.6 }]}
								onPress={handleRemove}
								disabled={removing}>
								{removing ? (
									<ActivityIndicator
										size="small"
										color={colors.destructiveRed}
									/>
								) : (
									<Text style={styles.removeButtonText}>Remove</Text>
								)}
							</TouchableOpacity>
						</>
					)}
				</View>

				<Text style={styles.overview}>{show.overview}</Text>

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
									isTracked={!!watchlistItem}
									preloadedEpisodes={episodesBySeason.get(season.season_number)}
								/>
							))}
					</View>
				)}
			</View>

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
		</ScrollView>
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
		width: "100%",
		height: 220,
	},
	content: {
		padding: spacing.lg,
	},
	title: {
		...typography.title,
		fontSize: 24,
	},
	meta: {
		...typography.caption,
		marginTop: spacing.xs,
	},
	actions: {
		flexDirection: "row",
		gap: spacing.sm,
		marginTop: spacing.lg,
	},
	addButton: {
		flex: 1,
		backgroundColor: colors.primary,
		paddingVertical: spacing.md,
		borderRadius: 8,
		alignItems: "center",
	},
	buttonText: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.text,
	},
	removeButton: {
		flex: 1,
		paddingVertical: spacing.md,
		borderRadius: 8,
		alignItems: "center",
		borderWidth: 1.5,
		borderColor: colors.destructiveRed,
		backgroundColor: "transparent",
	},
	removeButtonText: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.destructiveRed,
	},
	overview: {
		...typography.body,
		color: colors.textSecondary,
		marginTop: spacing.lg,
		lineHeight: 22,
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
