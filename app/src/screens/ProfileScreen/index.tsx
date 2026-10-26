import React, { useLayoutEffect, useCallback, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, PixelRatio } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useNavigation, useFocusEffect, useIsFocused } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../stores";
import {
	useUserStats,
	useWatchlist,
	useWeeklyActivity,
	useProfileCardImages,
	useCompletedShows,
} from "../../hooks";
import { colors } from "../../theme";
import { ProfileStackParamList, Route, MediaType } from "../../types";
import WeeklyChart from "../../components/WeeklyChart";
import StatCard from "./StatCard";
import CircleButton from "../../components/CircleButton";
import WatchHistoryButton from "./WatchHistoryButton";
import { CircleButtonTone } from "../../enums";

/** Same height as the Hall of Shame pill; gear fills ~55% of it */
const ACTION_HEIGHT = 56;
const SETTINGS_ICON = Math.round(ACTION_HEIGHT * 0.55);
import CollageCard from "./CollageCard";
import CompletedSections from "./CompletedSections";
import { styles } from "./styles";
import { formatCount, formatTime, scaledPhotoURL } from "../../utils";

// Reset when the app process restarts, so the intro plays once per launch
let introPlayed = false;

export default function ProfileScreen() {
	// Keyed off the first *focus*, not the first mount: Home preloads this tab a few seconds
	// after launch, so the screen mounts offscreen and the intro would play where nobody sees it
	const focused = useIsFocused();
	const [intro, setIntro] = useState(false);
	useEffect(() => {
		if (!focused || introPlayed) return;
		introPlayed = true;
		setIntro(true);
	}, [focused]);
	const { top } = useSafeAreaInsets();
	const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
	const user = useAuthStore((s) => s.user);
	const { stats, loading: statsLoading } = useUserStats(user?.uid);
	const { items: watchlist } = useWatchlist(user?.uid);
	const { chartData, refresh: refreshChart } = useWeeklyActivity(user?.uid);
	const cardImages = useProfileCardImages(watchlist);
	const { sections: completedSections, loading: completedLoading } = useCompletedShows(user?.uid);

	useFocusEffect(
		useCallback(() => {
			refreshChart();
		}, [refreshChart]),
	);

	const handleCompletedItemPress = useCallback(
		(tmdbId: number, mediaType: MediaType) => {
			navigation.navigate(Route.SHOW_DETAIL, { tmdbId, mediaType });
		},
		[navigation],
	);

	useLayoutEffect(() => {
		navigation.setOptions({
			headerRight: () => (
				<TouchableOpacity
					onPress={() => navigation.navigate(Route.SETTINGS)}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Ionicons name="settings-outline" size={22} color={colors.text} />
				</TouchableOpacity>
			),
		});
	}, [navigation]);

	return (
		<ScrollView
			style={[styles.container, { paddingTop: top }]}
			// Room under the last row so the tab bar doesn't cover it
			contentContainerStyle={styles.scrollContent}
		>
			<View style={styles.profileSection}>
				<View style={styles.statsGrid}>
					<View style={styles.statsRow}>
						<StatCard
							value={stats.episodesWatched}
							format={formatCount}
							countUp={intro}
							label="Episodes"
							flex={3}
							backdrop={cardImages.episodeBackdrop}
							align="left"
							loading={statsLoading}
						/>
						<StatCard
							value={stats.moviesWatched}
							format={formatCount}
							countUp={intro}
							label="Movies"
							flex={2}
							backdrop={cardImages.movieBackdrop}
							align="right"
							loading={statsLoading}
						/>
					</View>
					<View style={[styles.statsRow, { minHeight: 150 }]}>
						<CollageCard
							value={stats.showsTracking}
							format={formatCount}
							countUp={intro}
							label="Tracking"
							flex={2}
							posters={cardImages.trackingPosters}
							align="left"
							loading={statsLoading}
							seed={17}
						/>
						<CollageCard
							value={stats.totalMinutes}
							format={formatTime}
							countUp={intro}
							label="Watch Time"
							flex={3}
							posters={cardImages.watchTimePosters}
							align="right"
							loading={statsLoading}
							seed={53}
						/>
					</View>
					<View style={styles.avatarOverlay}>
						<View style={[styles.avatar, styles.avatarPlaceholder]}>
							<Ionicons name="person" size={40} color={colors.textMuted} />
						</View>
						{user?.photoURL && (
							<Image
								source={{ uri: scaledPhotoURL(user.photoURL, 100, PixelRatio.get()) }}
								style={[styles.avatar, { position: "absolute" }]}
								contentFit="cover"
							/>
						)}
					</View>
				</View>
				<View style={styles.header}>
					<Text style={styles.name}>{user?.displayName || "User"}</Text>
					<Text style={styles.email} numberOfLines={1}>
						{user?.email}
					</Text>
				</View>
			</View>

			{/* Hall of Shame (Watch History) + Settings gear on one row */}
			<View style={styles.actionRow}>
				<WatchHistoryButton onPress={() => navigation.navigate(Route.WATCH_HISTORY)} />
				<CircleButton
					tone={CircleButtonTone.RAISED}
					style={styles.settingsCircle}
					onPress={() => navigation.navigate(Route.SETTINGS)}
					accessibilityLabel="Settings"
				>
					<Ionicons name="settings-sharp" size={SETTINGS_ICON} color={colors.text} />
				</CircleButton>
			</View>

			<WeeklyChart data={chartData} animate={intro} />

			<CompletedSections
				sections={completedSections}
				loading={completedLoading}
				onItemPress={handleCompletedItemPress}
			/>
		</ScrollView>
	);
}
