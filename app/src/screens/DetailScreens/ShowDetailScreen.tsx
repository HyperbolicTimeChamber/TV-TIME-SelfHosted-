import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Alert, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import Reanimated, {
	runOnJS,
	useAnimatedReaction,
	useAnimatedScrollHandler,
	useAnimatedStyle,
	useDerivedValue,
	useSharedValue,
} from "react-native-reanimated";
import DetailBackdrop from "./DetailBackdrop";
import ActionPills from "./ActionPills";
import DetailCredits from "./DetailCredits";
import WhereToWatch from "../../components/WhereToWatch";
import CastRow from "../../components/CastRow";
import LocalReleaseLine from "../../components/LocalReleaseLine";
import { releaseStatLabel } from "../../utils/localRelease";
import { useTitleExtras } from "../../hooks/useTitleExtras";
import StudiosRow from "../../components/StudiosRow";
import WatchCountPill from "../../components/WatchCountPill";
import { useShowDetailActions } from "./useShowDetailActions";
import { useAuthStore } from "../../stores";
import { useCustomLists } from "../../hooks/useCustomLists";
import {
	AddFailedModal,
	AddToListSheet,
	ConfirmModal,
	LoadingSpinner,
	SeasonDropdown,
	UnreleasedMovieModal,
	WatchCountSheet,
} from "../../components";
import { showShareUrl, describeLoadError, titleListCount } from "../../utils";
import ErrorState from "../../components/ErrorState";
import CircleButton, { CIRCLE_BUTTON_SIZE, CircleBackButton } from "../../components/CircleButton";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import { colors, fonts, isLightTheme, spacing, typography, themedStyles } from "../../theme";
import { StatusBar } from "expo-status-bar";
import { HomeStackParamList, MediaType, Route, WatchStatus } from "../../types";
import { CircleButtonTone } from "../../enums";
import { ModalBackdrop, ModalLogo } from "../../components/modals/ModalArt";
import { getCachedCatalogShow } from "../../hooks/useWatchlist";
import { pickTitleLogo } from "../../services/tmdb";
import { requireOnline } from "../../utils/requireOnline";

type RouteParams = RouteProp<HomeStackParamList, "ShowDetail">;

/** Space kept between the sticky back button and the pills pushing it off */
const BACK_PUSH_GAP = 8;

/** "S03E04 – My Lucky Night" for the rewatch gate */
function rewatchBlockedLabel(b: { season: number; episode: number; name: string | null }) {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `S${pad(b.season)}E${pad(b.episode)}${b.name ? ` – ${b.name}` : ""}`;
}

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
		watchCount,
		hasStarted,
		movieSheetVisible,
		setMovieSheetVisible,
		removeModalVisible,
		setRemoveModalVisible,
		removeError,
		setRemoveError,
		unreleasedModal,
		addFailure,
		retryAdd,
		setAddFailure,
		setUnreleasedModal,
		title,
		year,
		directors,
		writers,
		handleAddToWatchlist,
		handleRemove,
		handleConfirmRemove,
		handleMarkMovieWatched,
		handleResumeOrRewatch,
		pauseModalVisible,
		setPauseModalVisible,
		pausing,
		handleConfirmPause,
		handleMovieWatchCountChange,
		rewatchBlocked,
		setRewatchBlocked,
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
	// The directors' photos for the credits (every extras section reads the same query)
	const { data: extras, isPending: extrasPending } = useTitleExtras(tmdbId, mediaType);
	const insets = useSafeAreaInsets();
	// "Add to List" button (next to Share): blue once the title is in any list
	const userId = useAuthStore((s) => s.user?.uid);
	const { lists } = useCustomLists(userId);
	const [listSheetOpen, setListSheetOpen] = useState(false);
	const listCount = titleListCount(lists, tmdbId, mediaType);
	const listEntry = useMemo(
		() => ({ tmdbId, mediaType, title: title ?? "", posterPath: show?.poster_path ?? null }),
		[tmdbId, mediaType, title, show?.poster_path],
	);
	const BACKDROP_HEIGHT = 350;
	// Parallax runs on the UI thread — a setState per scroll event would re-render the whole screen
	const scrollY = useSharedValue(0);
	// A deep link reuses this screen: the loading state swaps the ScrollView for a new one at the
	// top without a scroll event, which left the backdrop and back button where the old page was
	const pageLoading = isLoading || trackingLoading;
	useEffect(() => {
		if (pageLoading) scrollY.value = 0;
	}, [pageLoading, scrollY]);
	const handleScroll = useAnimatedScrollHandler((e) => {
		scrollY.value = e.contentOffset.y;
	});
	// Light icons over the poster; on the light theme they switch to dark once the page scrolls
	// past it (white icons vanished on the light page background)
	const [pastPoster, setPastPoster] = useState(false);
	const statusBarFlip = BACKDROP_HEIGHT - insets.top;
	useAnimatedReaction(
		() => scrollY.value > statusBarFlip,
		(past, prev) => {
			if (past !== prev) runOnJS(setPastPoster)(past);
		},
	);
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

	const whereToWatch = (
		<WhereToWatch tmdbId={tmdbId} mediaType={mediaType} title={title ?? ""} bleed={spacing.lg} />
	);

	return (
		// Right swipe anywhere → back, the screen underneath showing through (transparent modal route)
		<SwipeBackView onBack={handleBack} {...swipeBack} style={styles.container}>
			{/* The poster runs under the status bar: light icons on it, whatever the theme */}
			<StatusBar style={pastPoster && isLightTheme() ? "dark" : "light"} />
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
								tint={isLightTheme() ? colors.text : undefined}
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
								hasStarted={hasStarted}
								onAddToWatchlist={handleAddToWatchlist}
								onMarkMovieWatched={handleMarkMovieWatched}
								onResumeOrRewatch={handleResumeOrRewatch}
								onPause={() => requireOnline() && setPauseModalVisible(true)}
								onRemove={handleRemove}
								onWatchSheetOpen={() => setMovieSheetVisible(true)}
								listCount={listCount}
								onAddToList={() => setListSheetOpen(true)}
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
									{mediaType === MediaType.MOVIE ? releaseStatLabel(show.release_date) : "YEAR"}
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
						{/* Under the description: above a movie's local release, a show's seasons */}
						{whereToWatch}

						{mediaType === MediaType.MOVIE && (
							<LocalReleaseLine
								tmdbId={tmdbId}
								globalRelease={show.release_date}
								style={styles.localRelease}
							/>
						)}

						{mediaType === MediaType.MOVIE && (
							<DetailCredits
								tmdbId={tmdbId}
								mediaType={mediaType}
								directors={directors}
								writers={writers}
								directorPeople={extras?.directors}
								writerPeople={extras?.writers}
								photosPending={extrasPending}
							/>
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

						<CastRow
							tmdbId={tmdbId}
							mediaType={mediaType}
							title={title ?? ""}
							bleed={spacing.lg}
						/>
						<StudiosRow tmdbId={tmdbId} mediaType={mediaType} bleed={spacing.lg} />
					</View>
				</View>
				{/* Back sticks to the top until the pills push it off; share rides at the top of the
				    page (scrolls away with it). Both drawn over the backdrop */}
				<Reanimated.View style={[styles.backButton, { top: buttonTop }, stickyBack]}>
					<CircleBackButton tone={CircleButtonTone.OVERLAY} onPress={handleBack} />
				</Reanimated.View>
				{watchCount > 0 && (
					// Top edge level with back / share (not centred on them)
					<View style={[styles.watchCountRow, { top: buttonTop }]} pointerEvents="none">
						<WatchCountPill count={watchCount} overlay />
					</View>
				)}
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
					<Ionicons name="share-social-outline" size={26} color={colors.onImage} />
				</CircleButton>
			</Reanimated.ScrollView>

			<AddToListSheet
				entry={listSheetOpen ? listEntry : null}
				onClose={() => setListSheetOpen(false)}
				hideCounts
			/>

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
				drawer
				question={
					watchlistItem?.status === WatchStatus.REWATCHING
						? "Do You Want to Pause This Rewatch?"
						: "Do You Want to Pause This Show?"
				}
				slideLabel="Slide to Pause"
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

			{/* Next rewatch only once every aired episode is at the current run */}
			<ConfirmModal
				visible={!!rewatchBlocked}
				title="Finish Watching First"
				image={
					<ModalLogo logoPath={logoPath} tmdbId={tmdbId} mediaType={mediaType} title={title} />
				}
				hint={
					rewatchBlocked
						? `${rewatchBlockedLabel(rewatchBlocked)} isn't at x${rewatchBlocked.count} yet. Every aired episode needs x${rewatchBlocked.count} before rewatch ${rewatchBlocked.count} can start.`
						: undefined
				}
				confirmLabel="OK"
				confirmColor={colors.primary}
				hideCancel
				onConfirm={() => setRewatchBlocked(null)}
				onClose={() => setRewatchBlocked(null)}
			/>

			<AddFailedModal
				failure={addFailure}
				retrying={adding}
				onRetry={retryAdd}
				onClose={() => setAddFailure(null)}
			/>

			<UnreleasedMovieModal
				visible={!!unreleasedModal}
				onClose={() => setUnreleasedModal(null)}
				movieTitle={unreleasedModal?.title ?? ""}
			/>

			<WatchCountSheet
				visible={movieSheetVisible}
				title={title || "Movie"}
				tmdbId={tmdbId}
				mediaType={mediaType}
				logoPath={logoPath}
				watchCount={movieWatchCount}
				onCommit={handleMovieWatchCountChange}
				onClose={() => setMovieSheetVisible(false)}
			/>
		</SwipeBackView>
	);
}

const styles = themedStyles(() => StyleSheet.create({
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
	// Left of Share (44px button + 8px gap)
	// Centred between back and share
	watchCountRow: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 10 },
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
	// The metric font of the Upcoming / calendar cards (values only; labels stay as they are)
	statValue: {
		fontFamily: fonts.smoochMedium,
		fontSize: 24,
		letterSpacing: 0.5,
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
	// Lines up with the description above it
	// The big date's line box already leaves room under it
	localRelease: { paddingHorizontal: spacing.sm, marginTop: spacing.xl, marginBottom: -spacing.sm },
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
		// In line with the page's text
		paddingHorizontal: spacing.sm,
	},
}));
