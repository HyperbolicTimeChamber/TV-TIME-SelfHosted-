import React, { useLayoutEffect, useCallback } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	ScrollView,
	StyleSheet,
	Alert,
	ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { FlatList } from "react-native";
import { useAuthStore } from "../stores";
import {
	useUserStats,
	useWatchlist,
	useWeeklyActivity,
	useProfileCardImages,
	useCompletedShows,
} from "../hooks";
import { colors, spacing, typography, posterSize, backdropSize } from "../theme";
import { ProfileStackParamList, Route } from "../types";
import WeeklyChart from "../components/WeeklyChart";

const BLUR_RADIUS = 0.5;

export default function ProfileScreen() {
	const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
	const user = useAuthStore((s) => s.user);
	const signOut = useAuthStore((s) => s.signOut);
	const { stats, loading: statsLoading } = useUserStats(user?.uid);
	const { items: watchlist } = useWatchlist(user?.uid);
	const { chartData, refresh: refreshChart } = useWeeklyActivity();

	useFocusEffect(
		useCallback(() => {
			refreshChart();
		}, [refreshChart]),
	);
	const cardImages = useProfileCardImages(watchlist);
	const { sections: completedSections, loading: completedLoading } = useCompletedShows(user?.uid);

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

	const formatCount = (n: number) => {
		if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
		if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
		return `${n}`;
	};

	const formatTime = (minutes: number) => {
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);
		const years = Math.floor(days / 365);
		if (years > 0) return `${years}y ${days % 365}d`;
		if (days > 0) return `${days}d ${hours % 24}h`;
		if (hours > 0) return `${hours}h ${minutes % 60}m`;
		return `${minutes}m`;
	};

	const StatCard = ({
		value,
		label,
		flex,
		backdrop,
	}: {
		value: string | number;
		label: string;
		flex: number;
		backdrop?: string | null;
	}) => (
		<View style={[styles.statCard, { flex }]}>
			{backdrop && (
				<Image
					source={{ uri: `${backdropSize.medium}${backdrop}` }}
					style={StyleSheet.absoluteFill}
					contentFit="cover"
					blurRadius={BLUR_RADIUS}
				/>
			)}
			{backdrop && <View style={[StyleSheet.absoluteFill, styles.statCardOverlay]} />}
			<Text style={styles.statLabel}>{label}</Text>
			{statsLoading ? (
				<ActivityIndicator size="small" color={colors.primary} style={styles.statLoader} />
			) : (
				<Text style={styles.statNumber}>{value}</Text>
			)}
		</View>
	);

	const CollageCard = ({
		value,
		label,
		flex,
		backdrops = [],
	}: {
		value: string | number;
		label: string;
		flex: number;
		backdrops?: string[];
	}) => {
		const count = backdrops.length;

		return (
			<View style={[styles.statCard, { flex }]}>
				{count > 0 && (
					<View style={[StyleSheet.absoluteFill, styles.collageContainer]}>
						{backdrops.map((b, i) => {
							const overlap = 15;
							const sliceW = 100 / count + overlap;
							const sliceLeft = (100 / count) * i - overlap / 2;
							return (
								<View
									key={i}
									style={[
										styles.collageSlice,
										{
											left: `${sliceLeft}%` as any,
											width: `${sliceW}%` as any,
											zIndex: count - i,
										},
									]}
								>
									<Image
										source={{ uri: `${backdropSize.small}${b}` }}
										style={styles.slantedImage}
										contentFit="cover"
										blurRadius={BLUR_RADIUS}
									/>
									{i > 0 && <View style={styles.slantedEdge} />}
								</View>
							);
						})}
					</View>
				)}
				{count > 0 && (
					<View style={[StyleSheet.absoluteFill, styles.statCardOverlay]} />
				)}
				<Text style={styles.statLabel}>{label}</Text>
				{statsLoading ? (
					<ActivityIndicator size="small" color={colors.primary} style={styles.statLoader} />
				) : (
					<Text style={styles.statNumber}>{value}</Text>
				)}
			</View>
		);
	};

	return (
		<ScrollView style={styles.container}>
			<View style={styles.profileSection}>
				<View style={styles.header}>
					{user?.photoURL ? (
						<Image source={{ uri: user.photoURL }} style={styles.avatar} contentFit="cover" />
					) : (
						<View style={[styles.avatar, styles.avatarPlaceholder]}>
							<Text style={styles.avatarText}>
								{(user?.displayName || "?")[0].toUpperCase()}
							</Text>
						</View>
					)}
					<Text style={styles.name}>{user?.displayName || "User"}</Text>
					<Text style={styles.email}>{user?.email}</Text>
				</View>

				<View style={styles.statsGrid}>
				<View style={styles.statsRow}>
					<StatCard
						value={formatCount(stats.episodesWatched)}
						label="Episodes"
						flex={3}
						backdrop={cardImages.episodeBackdrop}
					/>
					<StatCard
						value={formatCount(stats.moviesWatched)}
						label="Movies"
						flex={2}
						backdrop={cardImages.movieBackdrop}
					/>
				</View>
				<View style={styles.statsRow}>
					<CollageCard
						value={formatCount(stats.showsTracking)}
						label="Tracking"
						flex={2}
						backdrops={cardImages.trackingBackdrops}
					/>
					<CollageCard
						value={formatTime(stats.totalMinutes)}
						label="Watch Time"
						flex={3}
						backdrops={cardImages.watchTimeBackdrops}
					/>
				</View>
				</View>
			</View>

			<WeeklyChart data={chartData} />

			{completedLoading ? (
				<View style={styles.completedLoader}>
					<ActivityIndicator size="small" color={colors.primary} />
				</View>
			) : completedSections.length > 0 ? (
				<View style={styles.section}>
					<Text style={styles.sectionTitle}>Recently Completed</Text>
					{completedSections.map((section) => (
						<View key={section.title} style={styles.genreSection}>
							<Text style={styles.genreTitle}>{section.title}</Text>
							<FlatList
								horizontal
								data={section.items}
								keyExtractor={(item) => `${item.tmdbId}`}
								showsHorizontalScrollIndicator={false}
								renderItem={({ item }) => (
									<Image
										source={
											item.posterPath
												? { uri: `${posterSize.small}${item.posterPath}` }
												: undefined
										}
										style={styles.completedPoster}
										contentFit="cover"
									/>
								)}
								ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
							/>
						</View>
					))}
				</View>
			) : null}

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

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	profileSection: {
		marginHorizontal: spacing.lg,
	},
	header: {
		alignItems: "center",
		zIndex: 2,
		paddingTop: spacing.xl,
		marginBottom: -40,
	},
	avatar: {
		width: 80,
		height: 80,
		borderRadius: 40,
	},
	avatarPlaceholder: {
		backgroundColor: colors.surfaceLight,
		justifyContent: "center",
		alignItems: "center",
	},
	avatarText: {
		...typography.title,
		fontSize: 32,
	},
	name: {
		...typography.title,
		marginTop: spacing.md,
	},
	email: {
		...typography.caption,
		marginTop: spacing.xs,
	},
	statsGrid: {
		gap: spacing.sm,
		paddingTop: 50,
	},
	statsRow: {
		flexDirection: "row",
		gap: spacing.sm,
	},
	statCard: {
		backgroundColor: colors.surface,
		borderRadius: 12,
		padding: spacing.lg,
		justifyContent: "space-between",
		minHeight: 100,
		overflow: "hidden",
	},
	statCardOverlay: {
		backgroundColor: "rgba(0, 0, 0, 0.55)",
	},
	collageContainer: {
		flexDirection: "row",
		overflow: "hidden",
	},
	collageSlice: {
		position: "absolute",
		top: 0,
		bottom: 0,
	},
	slantedImage: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	slantedEdge: {
		position: "absolute",
		left: -12,
		top: -30,
		bottom: -30,
		width: 24,
		backgroundColor: colors.surface,
		transform: [{ rotate: "12deg" }],
		zIndex: 2,
	},
	statNumber: {
		...typography.title,
		fontSize: 32,
	},
	statLoader: {
		height: 38,
		alignSelf: "flex-start",
	},
	statLabel: {
		...typography.caption,
		color: colors.text,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		alignSelf: "flex-start",
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs / 2,
		borderRadius: 10,
		overflow: "hidden",
	},
	section: {
		marginTop: spacing.xl,
		paddingHorizontal: spacing.lg,
	},
	sectionTitle: {
		...typography.subtitle,
		marginBottom: spacing.md,
	},
	genreSection: {
		marginBottom: spacing.lg,
	},
	genreTitle: {
		...typography.caption,
		color: colors.text,
		marginBottom: spacing.sm,
	},
	completedPoster: {
		width: 80,
		height: 120,
		borderRadius: 6,
	},
	completedLoader: {
		marginTop: spacing.xl,
		alignItems: "center",
	},
	signOutButton: {
		marginTop: spacing.xxl,
		marginHorizontal: spacing.lg,
		marginBottom: spacing.xxl * 2,
		paddingVertical: spacing.lg,
		backgroundColor: colors.surface,
		borderRadius: 8,
		alignItems: "center",
	},
	signOutText: {
		...typography.subtitle,
		color: colors.destructiveRed,
	},
});
