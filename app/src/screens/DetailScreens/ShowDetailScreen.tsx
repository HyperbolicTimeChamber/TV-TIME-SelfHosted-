import React, { useCallback, useRef } from "react";
import { View, Text, StyleSheet, Alert, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import Reanimated, {
	useAnimatedScrollHandler,
	useAnimatedStyle,
	useDerivedValue,
	useSharedValue,
} from "react-native-reanimated";
import DetailBackdrop from "./DetailBackdrop";
import ActionPills from "./ActionPills";
import DetailCredits from "./DetailCredits";
import { useShowDetailActions } from "./useShowDetailActions";
import {
	AddFailedModal,
	ConfirmModal,
	LoadingSpinner,
	SeasonDropdown,
	UnreleasedMovieModal,
	WatchActionSheet,
} from "../../components";
import { showShareUrl, describeLoadError } from "../../utils";
import ErrorState from "../../components/ErrorState";
import CircleButton, { CIRCLE_BUTTON_SIZE, CircleBackButton } from "../../components/CircleButton";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import { colors, spacing, typography } from "../../theme";
import { HomeStackParamList, MediaType, Route, WatchStatus } from "../../types";
import { CircleButtonTone } from "../../enums";
import { ModalBackdrop, ModalLogo } from "../../components/modals/ModalArt";
import { getCachedCatalogShow } from "../../hooks/useWatchlist";
import { pickTitleLogo } from "../../services/tmdb";

type RouteParams = RouteProp<HomeStackParamList, "ShowDetail">;

/** Space kept between the sticky back button and the pills pushing it off */
const BACK_PUSH_GAP = 8;

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
		addFailure,
		setAddFailure,
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
	// Catalog's logo, else the one that came with the details (same request as the page data)
	const logoPath =
		getCachedCatalogShow(tmdbId, mediaType)?.logoPath ??
		(show?.images ? pickTitleLogo(show.images.logos) : undefined);

	const navigation = useNavigation();
	// Opened from a deep link with nothing underneath → go to the watchlist
	const handleBack = useCallback(() => {
		if (navigation.canGoBack()) navigation.goBack();
		else (navigation as any).navigate(Route.HOME, { screen: Route.HOME_TABS });
	}, [navigation]);
	const swipeBack = useSwipeBackPop(navigation as never);
	const insets = useSafeAreaInsets();
	const BACKDROP_HEIGHT = 350;
	// Parallax runs on the UI thread — a setState per scroll event would re-render the whole screen
	const scrollY = useSharedValue(0);
	const handleScroll = useAnimatedScrollHandler((e) => {
		scrollY.value = e.contentOffset.y;
	});
	const imageTranslateY = useDerivedValue(() =>
		Math.min(scrollY.value * 0.4, BACKDROP_HEIGHT * 0.5),
	);

	// Back button stays pinned to the top while the page scrolls, until the action pills come up
	// under it — then they push it up and off with them, like a sticky header handing over
	const buttonTop = insets.top + 8;
	const contentRef = useRef<View>(null);
	const pillsRef = useRef<View>(null);
	const pillsY = useSharedValue(0);
	const measurePills = () => {
		if (!contentRef.current) return;
		pillsRef.current?.measureLayout(contentRef.current, (_x, y) => {
			pillsY.value = y;
		});
	};
	const stickyBack = useAnimatedStyle(() => {
		// Furthest it can follow the scroll before its bottom would meet the pills (8px gap)
		const maxShift = pillsY.value
			? pillsY.value - BACK_PUSH_GAP - CIRCLE_BUTTON_SIZE - buttonTop
			: Number.MAX_VALUE;
		return { transform: [{ translateY: Math.max(0, Math.min(scrollY.value, maxShift)) }] };
	});

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
			<SwipeBackView onBack={handleBack} {...swipeBack} style={styles.container}>
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
			</SwipeBackView>
		);
	}

	return (
		// Right swipe anywhere → back, the screen underneath showing through (transparent modal route)
		<SwipeBackView onBack={handleBack} {...swipeBack} style={styles.container}>
			<Reanimated.ScrollView
				contentContainerStyle={{ paddingBottom: spacing.xxl + Math.max(insets.bottom, 48) }}
				onScroll={handleScroll}
				scrollEventThrottle={16}
			>
				{/* Plain column wrapper: the frame the pills are measured against */}
				<View ref={contentRef} collapsable={false}>
					<DetailBackdrop
						backdropPath={show.backdrop_path}
						posterPath={show.poster_path}
						imageTranslateY={imageTranslateY}
					>
						{/* Title logo (name as the fallback), centred */}
						<View style={styles.islandLogo} accessibilityRole="header" accessibilityLabel={title}>
							<ModalLogo
								logoPath={logoPath}
								tmdbId={tmdbId}
								mediaType={mediaType}
								title={title}
								nameDelay={2000}
							/>
						</View>

						<View ref={pillsRef} collapsable={false} onLayout={measurePills}>
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
						</View>
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
									?.map((season, i, list) => (
										<SeasonDropdown
											key={season.season_number}
											isFirst={i === 0}
											isLast={i === list.length - 1}
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
				</View>
				{/* Back sticks to the top until the pills push it off; share rides at the top of the
				    page (scrolls away with it). Both drawn over the backdrop */}
				<Reanimated.View style={[styles.backButton, { top: buttonTop }, stickyBack]}>
					<CircleBackButton tone={CircleButtonTone.OVERLAY} onPress={handleBack} />
				</Reanimated.View>
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
				imageAtTop={!!show?.backdrop_path}
				hideTitle
				image={
					show?.backdrop_path ? (
						<ModalBackdrop
							backdropPath={show.backdrop_path}
							logoPath={logoPath}
							tmdbId={tmdbId}
							mediaType={mediaType}
							title={title}
							paused
							nameDelay={2000}
						/>
					) : (
						<ModalLogo
							logoPath={logoPath}
							tmdbId={tmdbId}
							mediaType={mediaType}
							title={title}
							paused
							nameDelay={2000}
						/>
					)
				}
				hint={
					watchlistItem?.status === WatchStatus.REWATCHING
						? "Pausing this rewatch will take it off your watchlist. You can resume it any time from here."
						: "Pausing this show will take it off your watchlist. You can resume it any time from here."
				}
				confirmLabel="Pause"
				confirmColor={colors.stopBlue}
				loading={pausing}
				onConfirm={handleConfirmPause}
				onClose={() => setPauseModalVisible(false)}
			/>

			<AddFailedModal
				failure={addFailure}
				retrying={adding}
				onRetry={handleAddToWatchlist}
				onClose={() => setAddFailure(null)}
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
		</SwipeBackView>
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
	islandLogo: {
		alignItems: "center",
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
