import React, { useLayoutEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { Image } from "expo-image";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
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
import CollageCard from "./CollageCard";
import CompletedSections from "./CompletedSections";
import { styles } from "./styles";

function formatCount(n: number) {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
	return `${n}`;
}

function formatTime(minutes: number) {
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const years = Math.floor(days / 365);
	if (years > 0) return `${years}y ${days % 365}d`;
	if (days > 0) return `${days}d ${hours % 24}h`;
	if (hours > 0) return `${hours}h ${minutes % 60}m`;
	return `${minutes}m`;
}

export default function ProfileScreen() {
	const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
	const user = useAuthStore((s) => s.user);
	const signOut = useAuthStore((s) => s.signOut);
	const { stats, loading: statsLoading } = useUserStats(user?.uid);
	const { items: watchlist } = useWatchlist(user?.uid);
	const { chartData, refresh: refreshChart } = useWeeklyActivity();
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
		<ScrollView style={styles.container}>
			<View style={styles.profileSection}>
				<View style={styles.statsGrid}>
					<View style={styles.statsRow}>
						<StatCard
							value={formatCount(stats.episodesWatched)}
							label="Episodes"
							flex={3}
							backdrop={cardImages.episodeBackdrop}
							align="left"
							loading={statsLoading}
						/>
						<StatCard
							value={formatCount(stats.moviesWatched)}
							label="Movies"
							flex={2}
							backdrop={cardImages.movieBackdrop}
							align="right"
							loading={statsLoading}
						/>
					</View>
					<View style={[styles.statsRow, { minHeight: 150 }]}>
						<CollageCard
							value={formatCount(stats.showsTracking)}
							label="Tracking"
							flex={2}
							posters={cardImages.trackingPosters}
							align="left"
							loading={statsLoading}
							seed={17}
						/>
						<CollageCard
							value={formatTime(stats.totalMinutes)}
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
								source={{ uri: user.photoURL }}
								style={[styles.avatar, { position: "absolute" }]}
								contentFit="cover"
							/>
						)}
					</View>
				</View>
				<View style={styles.header}>
					<Text style={styles.name}>{user?.displayName || "User"}</Text>
					<Text style={styles.email}>{user?.email}</Text>
				</View>
			</View>

			<WeeklyChart data={chartData} />

			<CompletedSections
				sections={completedSections}
				loading={completedLoading}
				onItemPress={handleCompletedItemPress}
			/>

			<TouchableOpacity
				style={styles.signOutButton}
				onPress={() => {
					Alert.alert("Log Out", "Are you sure?", [
						{ text: "Cancel", style: "cancel" },
						{ text: "Log Out", style: "destructive", onPress: signOut },
					]);
				}}
			>
				<Text style={styles.signOutText}>Log Out</Text>
			</TouchableOpacity>
		</ScrollView>
	);
}
