import { useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { LegendList } from "@legendapp/list/react-native";
import { useNavigation, CompositeNavigationProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LoadingSpinner, EpisodeDetailModal, ShowDrawer } from "../../../components";
import { colors, spacing, typography } from "../../../theme";
import { HomeStackParamList, MainStackParamList, Route, MediaType } from "../../../types";
import DateHeader from "./DateHeader";
import { useUpcomingScreen, type ListItem } from "./useUpcomingScreen";
import UpcomingEpisodeRow from "./UpcomingEpisodeRow";
import HomeEmpty, { UPCOMING_EMPTY_ART } from "../HomeEmpty";
import { todayStr } from "../../../utils";

const SCREEN_HEIGHT = Dimensions.get("window").height;

type NavProp = CompositeNavigationProp<
	NativeStackNavigationProp<HomeStackParamList, Route.HOME_TABS>,
	NativeStackNavigationProp<MainStackParamList>
>;

export default function UpcomingTab() {
	const navigation = useNavigation<NavProp>();

	const handleNavigateToShow = useCallback(
		(tmdbShowId: number) => {
			navigation.navigate(Route.SHOW_DETAIL, {
				tmdbId: tmdbShowId,
				mediaType: MediaType.TV,
			});
		},
		[navigation],
	);

	const {
		epModalVisible,
		setEpModalVisible,
		epModalData,
		setEpModalData,
		drawerVisible,
		setDrawerVisible,
		drawerShow,
		setDrawerShow,
		listData,
		firstUpcomingIndex,
		handleEpisodePress,
		handleLoadEpisodeDetails,
		handleTitlePress,
		handleEpModalShowPress,
		isLoading,
		error,
		retry,
	} = useUpcomingScreen(handleNavigateToShow);

	const stickyIndices = useMemo(
		() =>
			listData.reduce<number[]>((acc, item, i) => {
				if (item.type === "header") acc.push(i);
				return acc;
			}, []),
		[listData],
	);

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

	// Nothing from today on: the empty state — alone, or under the already-aired days still unwatched
	const nothingUpcoming = !listData.some((i) => i.type === "header" && i.date >= todayStr());
	const emptyState = (
		<HomeEmpty
			art={UPCOMING_EMPTY_ART}
			framed
			title="Nothing Upcoming to Watch?"
			subtitle="Aw. Who saw that coming?"
			tagline="Your schedule's as empty as a cancelled show's future. Add something now. Trust us."
			onAddShows={() => navigation.navigate(Route.SWIPE_TABS, { screen: Route.SEARCH })}
		/>
	);
	if (listData.length === 0) return emptyState;

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
				initialScrollIndex={firstUpcomingIndex}
				ListFooterComponent={nothingUpcoming ? emptyState : null}
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
		backgroundColor: colors.background,
	},
	listContent: {
		paddingBottom: spacing.xl,
	},
	center: {
		flex: 1,
		backgroundColor: colors.background,
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
