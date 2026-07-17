import { useCallback, useMemo } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LoadingSpinner } from "../../../components";
import { useAuthStore } from "../../../stores";
import { useUpcomingEpisodes } from "../../../hooks";
import { colors, spacing, typography } from "../../../theme";
import {
	UpcomingEpisode,
	HomeStackParamList,
	Route,
	MediaType,
} from "../../../types";
import DateHeader from "./DateHeader";
import UpcomingEpisodeRow from "./UpcomingEpisodeRow";

type NavProp = NativeStackNavigationProp<HomeStackParamList, Route.HOME_TABS>;

type ListItem =
	| { type: "header"; date: string }
	| { type: "episode"; episode: UpcomingEpisode };

export default function UpcomingTab() {
	const user = useAuthStore((s) => s.user);
	const navigation = useNavigation<NavProp>();
	const { data: episodes, isLoading } = useUpcomingEpisodes(user?.uid);

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

	const handlePress = useCallback(
		(tmdbShowId: number) => {
			navigation.navigate(Route.SHOW_DETAIL, {
				tmdbId: tmdbShowId,
				mediaType: MediaType.TV,
			});
		},
		[navigation],
	);

	const renderItem = useCallback(
		({ item }: { item: ListItem }) => {
			if (item.type === "header") {
				return <DateHeader date={item.date} />;
			}
			return (
				<UpcomingEpisodeRow episode={item.episode} onPress={handlePress} />
			);
		},
		[handlePress],
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

	if (listData.length === 0) {
		return (
			<View style={styles.center}>
				<Text style={styles.empty}>No upcoming episodes</Text>
			</View>
		);
	}

	return (
		<FlatList
			data={listData}
			keyExtractor={(item) =>
				item.type === "header"
					? `header_${item.date}`
					: `ep_${item.episode.tmdbShowId}_S${item.episode.season}E${item.episode.episode}`
			}
			renderItem={renderItem}
			removeClippedSubviews
			maxToRenderPerBatch={20}
			windowSize={5}
			style={styles.list}
			contentContainerStyle={styles.listContent}
		/>
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
	empty: {
		...typography.subtitle,
		color: colors.textSecondary,
	},
});
