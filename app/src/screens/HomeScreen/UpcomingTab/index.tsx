import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { LegendList } from "@legendapp/list/react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LoadingSpinner, EpisodeDetailModal, ShowDrawer } from "../../../components";
import type { ShowDrawerData } from "../../../components/ShowDrawer";
import type { CarouselEpisode } from "../../../components";
import { useAuthStore } from "../../../stores";
import { useUpcomingEpisodes } from "../../../hooks";
import { getCachedCatalogShow } from "../../../hooks/useWatchlist";
import { getCatalogShow, getShowDetails, getSeasonDetails } from "../../../services";
import { colors, spacing, typography } from "../../../theme";
import { UpcomingEpisode, HomeStackParamList, Route, MediaType } from "../../../types";
import DateHeader from "./DateHeader";
import UpcomingEpisodeRow from "./UpcomingEpisodeRow";

const SCREEN_HEIGHT = Dimensions.get("window").height;

type NavProp = NativeStackNavigationProp<HomeStackParamList, Route.HOME_TABS>;

type ListItem = { type: "header"; date: string } | { type: "episode"; episode: UpcomingEpisode };

export default function UpcomingTab() {
	const user = useAuthStore((s) => s.user);
	const navigation = useNavigation<NavProp>();
	const { data: episodes, isLoading, error, retry } = useUpcomingEpisodes(user?.uid);

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
		for (const [date, eps] of grouped) {
			result.push({ type: "header", date });
			for (const ep of eps) {
				result.push({ type: "episode", episode: ep });
			}
		}
		return result;
	}, [episodes]);

	const stickyIndices = useMemo(
		() =>
			listData.reduce<number[]>((acc, item, i) => {
				if (item.type === "header") acc.push(i);
				return acc;
			}, []),
		[listData],
	);

	const handleNavigateToShow = useCallback(
		(tmdbShowId: number) => {
			navigation.navigate(Route.SHOW_DETAIL, {
				tmdbId: tmdbShowId,
				mediaType: MediaType.TV,
			});
		},
		[navigation],
	);

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
				const catalog = await getCatalogShow(
					tmdbId,
					MediaType.TV,
				);
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
				setDrawerShow((prev) =>
					prev ? { ...prev, overview: prev.overview || "" } : null,
				);
			}
		}
	}, []);

	const handleEpModalShowPress = useCallback(() => {
		if (!epModalData || !epModalData.episodes[0]) return;
		setEpModalVisible(false);
		setEpModalData(null);
		handleNavigateToShow(epModalData.tmdbId);
	}, [epModalData, handleNavigateToShow]);

	const noopMark = useCallback(async () => {}, []);

	const renderItem = useCallback(
		({ item }: { item: ListItem }) => {
			if (item.type === "header") {
				return <DateHeader date={item.date} />;
			}
			return (
				<UpcomingEpisodeRow
					episode={item.episode}
					onPress={handleNavigateToShow}
					onTitlePress={handleTitlePress}
					onEpisodePress={handleEpisodePress}
				/>
			);
		},
		[handleNavigateToShow, handleTitlePress, handleEpisodePress],
	);

	if (isLoading) {
		return (
			<View style={styles.center}>
				<LoadingSpinner />
				<Text style={styles.loadingText}>Predicting Your Future...</Text>
				<Text style={styles.loadingHint}>This may take a moment</Text>
			</View>
		);
	}

	if (error) {
		return (
			<View style={styles.center}>
				<Text style={styles.errorText}>{error}</Text>
				<TouchableOpacity style={styles.retryButton} onPress={retry}>
					<Text style={styles.retryText}>Retry</Text>
				</TouchableOpacity>
			</View>
		);
	}

	if (listData.length === 0) {
		return (
			<View style={styles.center}>
				<Text style={styles.empty}>No upcoming episodes</Text>
			</View>
		);
	}

	return (
		<>
			<LegendList
				data={listData}
				keyExtractor={(item) =>
					item.type === "header"
						? `header_${item.date}`
						: `ep_${item.episode.tmdbShowId}_S${item.episode.season}E${item.episode.episode}`
				}
				renderItem={renderItem}
				recycleItems
				drawDistance={SCREEN_HEIGHT * 2}
				estimatedItemSize={100}
				stickyHeaderIndices={stickyIndices}
				style={styles.list}
				contentContainerStyle={styles.listContent}
			/>

			{epModalData && (
				<EpisodeDetailModal
					visible={epModalVisible}
					tmdbId={epModalData.tmdbId}
					showTitle={epModalData.showTitle}
					showPosterPath={epModalData.showPosterPath}
					showBackdropPath={epModalData.showBackdropPath}
					episodes={epModalData.episodes}
					initialIndex={epModalData.initialIndex}
					watchedKeys={epModalData.watchedKeys}
					currentNextEpisode={epModalData.currentNextEpisode}
					onMarkWatched={noopMark}
					onMarkWatchedThrough={noopMark}
					onUnmarkWatched={noopMark}
					onLoadEpisodeDetails={handleLoadEpisodeDetails}
					onShowPress={handleEpModalShowPress}
					onClose={() => {
						setEpModalVisible(false);
						setEpModalData(null);
					}}
				/>
			)}

			<ShowDrawer
				visible={drawerVisible}
				show={drawerShow}
				onGoToShow={
					drawerShow?.tmdbId
						? () => {
								const id = drawerShow.tmdbId!;
								setDrawerVisible(false);
								setDrawerShow(null);
								handleNavigateToShow(id);
							}
						: undefined
				}
				onClose={() => {
					setDrawerVisible(false);
					setDrawerShow(null);
				}}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	list: {
		flex: 1,
		backgroundColor: colors.surface,
	},
	listContent: {
		paddingBottom: spacing.xl,
	},
	center: {
		flex: 1,
		backgroundColor: colors.surface,
		justifyContent: "center",
		alignItems: "center",
	},
	loadingText: {
		...typography.subtitle,
		color: colors.textSecondary,
		marginTop: spacing.lg,
	},
	loadingHint: {
		...typography.caption,
		color: colors.textMuted,
		marginTop: spacing.xs,
	},
	empty: {
		...typography.subtitle,
		color: colors.textSecondary,
	},
	errorText: {
		...typography.subtitle,
		color: colors.destructiveRed,
	},
	retryButton: {
		marginTop: spacing.lg,
		backgroundColor: colors.primary,
		paddingHorizontal: spacing.xl,
		paddingVertical: spacing.md,
		borderRadius: 8,
	},
	retryText: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.text,
	},
});
