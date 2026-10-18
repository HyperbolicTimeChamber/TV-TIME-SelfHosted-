import React, { useCallback } from "react";
import { View, Text, StyleSheet, Alert, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import Reanimated, {
	useAnimatedScrollHandler,
	useDerivedValue,
	useSharedValue,
} from "react-native-reanimated";
import DetailBackdrop from "./DetailBackdrop";
import ActionPills from "./ActionPills";
import DetailCredits from "./DetailCredits";
import { useShowDetailActions } from "./useShowDetailActions";
import {
	ConfirmModal,
	LoadingSpinner,
	SeasonDropdown,
	UnreleasedMovieModal,
	WatchActionSheet,
} from "../../components";
import { showShareUrl, describeLoadError } from "../../utils";
import ErrorState from "../../components/ErrorState";
import CircleButton, { CircleBackButton } from "../../components/CircleButton";
import { colors, spacing, typography } from "../../theme";
import { HomeStackParamList, MediaType, Route, WatchStatus } from "../../types";
import { CircleButtonTone } from "../../enums";
import { ModalBackdrop, ModalLogo } from "../../components/modals/ModalArt";
import { getCachedCatalogShow } from "../../hooks/useWatchlist";

type RouteParams = RouteProp<HomeStackParamList, "ShowDetail">;

export default function ShowDetailScreen() {
	const route = useRoute<RouteParams>();
	const { tmdbId, mediaType } = route.params;
	const {
		refetch,
		show,
		isLoading,
		isError,
		error,
		episodesBySeason,
		watchlistItem,
		showWatchedEps,
		trackingLoading,
		adding,
		removing,
		movieWatchCount,
		movieSheetVisible,
		setMovieSheetVisible,
		removeModalVisible,
		setRemoveModalVisible,
		removeError,
		setRemoveError,
		unreleasedModal,
		setUnreleasedModal,
		title,
		year,
		directors,
		writers,
		producers,
		handleAddToWatchlist,
		handleRemove,
		handleConfirmRemove,
		handleMarkMovieWatched,
		handleResumeOrRewatch,
		pauseModalVisible,
		setPauseModalVisible,
		pausing,
		handleConfirmPause,
		handleMovieSheetAction,
		seasonLayout,
	} = useShowDetailActions(tmdbId, mediaType);
	const logoPath = getCachedCatalogShow(tmdbId, mediaType)?.logoPath ?? null;

	const navigation = useNavigation();
	// Opened from a deep link with nothing underneath → go to the watchlist
	const handleBack = useCallback(() => {
		if (navigation.canGoBack()) navigation.goBack();
		else (navigation as any).navigate(Route.HOME, { screen: Route.HOME_TABS });
	}, [navigation]);
	const insets = useSafeAreaInsets();
	const BACKDROP_HEIGHT = 350;
	// Parallax runs on the UI thread (was a setState per scroll event → whole screen re-rendered)
	const scrollY = useSharedValue(0);
	const handleScroll = useAnimatedScrollHandler((e) => {
		scrollY.value = e.contentOffset.y;
	});
	const imageTranslateY = useDerivedValue(() =>
		Math.min(scrollY.value * 0.4, BACKDROP_HEIGHT * 0.5),
	);

	if (isLoading || trackingLoading) {
		return (
			<View style={styles.center}>
				<LoadingSpinner />
			</View>
		);
	}

	if (isError || !show) {
		const info = describeLoadError(isError ? error : null, mediaType);
		const goWatchlist = () => (navigation as any).navigate(Route.HOME, { screen: Route.HOME_TABS });
		const goSearch = () => (navigation as any).navigate(Route.SWIPE_TABS, { screen: Route.SEARCH });
		return (
			<View style={styles.container}>
				<CircleBackButton
					tone={CircleButtonTone.OVERLAY}
					style={[styles.backButton, { top: insets.top + 8 }]}
					onPress={handleBack}
				/>
				<ErrorState
					info={info}
					mediaType={mediaType}
					primary={
						info.canRetry
							? { label: "Try Again", onPress: () => refetch() }
							: { label: "Search Shows & Movies", onPress: goSearch }
					}
					secondary={{ label: "Go to Watchlist", onPress: goWatchlist }}
				/>
			</View>
		);
	}

	return (
		<View style={styles.container}>
			{/* Floating back button */}
			<CircleBackButton
				tone={CircleButtonTone.OVERLAY}
				style={[styles.backButton, { top: insets.top + 8 }]}
				onPress={handleBack}
			/>

			<CircleButton
				tone={CircleButtonTone.OVERLAY}
				style={[styles.shareButton, { top: insets.top + 8 }]}
				accessibilityLabel="Share"
				onPress={() => {
					// Web URL: opens the app if installed (App/Universal Links), else the web show page
					Share.share({
						message: `Check out ${title}\n${showShareUrl(mediaType, tmdbId)}`,
					}).catch((e: any) => Alert.alert("Share failed", e.message));
				}}
			>
				<Ionicons name="share-social-outline" size={26} color={colors.text} />
			</CircleButton>

			<Reanimated.ScrollView
				contentContainerStyle={{ paddingBottom: spacing.xxl + Math.max(insets.bottom, 48) }}
				onScroll={handleScroll}
				scrollEventThrottle={16}
			>
				<DetailBackdrop
					backdropPath={show.backdrop_path}
					posterPath={show.poster_path}
					imageTranslateY={imageTranslateY}
				>
					<Text style={styles.islandTitle}>{title}</Text>

					<ActionPills
						mediaType={mediaType}
						watchlistItem={watchlistItem}
						adding={adding}
						removing={removing}
						movieWatchCount={movieWatchCount}
						hasWatchedEpisodes={showWatchedEps.length > 0}
						onAddToWatchlist={handleAddToWatchlist}
						onMarkMovieWatched={handleMarkMovieWatched}
						onResumeOrRewatch={handleResumeOrRewatch}
						onPause={() => setPauseModalVisible(true)}
						onRemove={handleRemove}
						onMovieSheetOpen={() => setMovieSheetVisible(true)}
					/>
				</DetailBackdrop>

				<View style={styles.content}>
					<View style={styles.statsBar}>
						{mediaType === MediaType.MOVIE && show.runtime ? (
							<>
								<View style={styles.statItem}>
									<Text style={styles.statValue}>
										{Math.floor(show.runtime / 60)}h {show.runtime % 60}m
									</Text>
									<Text style={styles.statLabel}>RUNTIME</Text>
								</View>
								<View style={styles.statDivider} />
							</>
						) : null}
						<View style={styles.statItem}>
							<Text style={styles.statValue}>{year || "—"}</Text>
							<Text style={styles.statLabel}>
								{mediaType === MediaType.MOVIE ? "RELEASED" : "YEAR"}
							</Text>
						</View>
						{mediaType === MediaType.TV && show.number_of_seasons ? (
							<>
								<View style={styles.statDivider} />
								<View style={styles.statItem}>
									<Text style={styles.statValue}>{show.number_of_seasons}</Text>
									<Text style={styles.statLabel}>
										{show.number_of_seasons > 1 ? "SEASONS" : "SEASON"}
									</Text>
								</View>
							</>
						) : null}
						{mediaType === MediaType.TV && show.number_of_episodes ? (
							<>
								<View style={styles.statDivider} />
								<View style={styles.statItem}>
									<Text style={styles.statValue}>{show.number_of_episodes}</Text>
									<Text style={styles.statLabel}>EPISODES</Text>
								</View>
							</>
						) : null}
						{show.vote_average ? (
							<>
								<View style={styles.statDivider} />
								<View style={styles.statItem}>
									<Text style={styles.statValue}>{show.vote_average.toFixed(1)}</Text>
									<Text style={styles.statLabel}>RATING</Text>
								</View>
							</>
						) : null}
					</View>
					<Text style={styles.overview}>{show.overview}</Text>

					{mediaType === MediaType.MOVIE && (
						<DetailCredits directors={directors} writers={writers} producers={producers} />
					)}

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
										trackingItem={watchlistItem}
										seasonLayout={seasonLayout}
										episodesBySeason={episodesBySeason}
										preloadedEpisodes={episodesBySeason.get(season.season_number)}
									/>
								))}
						</View>
					)}
				</View>
			</Reanimated.ScrollView>

			<ConfirmModal
				visible={removeModalVisible}
				title={mediaType === MediaType.MOVIE ? "Remove Movie?" : "Remove Show?"}
				image={
					<ModalLogo logoPath={logoPath} tmdbId={tmdbId} mediaType={mediaType} title={title} />
				}
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

			<ConfirmModal
				visible={pauseModalVisible}
				title={watchlistItem?.status === WatchStatus.REWATCHING ? "Pause Rewatch?" : "Pause Show?"}
				image={
					show?.backdrop_path ? (
						<ModalBackdrop
							backdropPath={show.backdrop_path}
							logoPath={logoPath}
							tmdbId={tmdbId}
							mediaType={mediaType}
							title={title}
							paused
						/>
					) : (
						<ModalLogo
							logoPath={logoPath}
							tmdbId={tmdbId}
							mediaType={mediaType}
							title={title}
							paused
						/>
					)
				}
				hint="It leaves your watchlist. Resume any time from here."
				confirmLabel="Pause"
				confirmColor={colors.stopBlue}
				loading={pausing}
				onConfirm={handleConfirmPause}
				onClose={() => setPauseModalVisible(false)}
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
	// Position only — the circle itself is components/CircleButton
	backButton: { position: "absolute", left: 16, zIndex: 10 },
	shareButton: { position: "absolute", right: 16, zIndex: 10 },
	islandTitle: {
		...typography.title,
		fontSize: 24,
	},
	statsBar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-evenly",
		backgroundColor: colors.surface,
		borderRadius: 12,
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.md,
		marginBottom: spacing.lg,
	},
	statItem: {
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.md,
	},
	statValue: {
		...typography.subtitle,
		fontSize: 18,
		fontWeight: "700",
		color: colors.text,
	},
	statLabel: {
		...typography.caption,
		fontSize: 9,
		color: colors.textMuted,
		marginTop: 2,
		letterSpacing: 1,
	},
	statDivider: {
		width: 1,
		height: 28,
		backgroundColor: colors.border,
	},
	content: {
		backgroundColor: colors.background,
		paddingHorizontal: spacing.lg,
		paddingTop: spacing.xs,
	},
	overview: {
		...typography.body,
		color: colors.textSecondary,
		lineHeight: 22,
		textAlign: "justify",
		paddingHorizontal: spacing.sm,
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
