import React, { useCallback, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LegendList } from "@legendapp/list/react-native";
import { LinearGradient } from "expo-linear-gradient";
import SlidingTabs from "../../../components/SlidingTabs";
import { CircleBackButton } from "../../../components/CircleButton";
import { useSharedShimmer } from "../../../components/SkeletonLine";
import { useWatchHistory } from "../../../hooks";
import { CircleButtonTone, MediaType, Route } from "../../../enums";
import type { ProfileStackParamList } from "../../../types";
import type { HistoryCard } from "../../../utils";
import { colors } from "../../../theme";
import HistoryCardView from "./HistoryCardView";
import HistoryCardSkeleton from "./HistoryCardSkeleton";
import { styles } from "./styles";

type Nav = NativeStackNavigationProp<ProfileStackParamList>;

const TABS = [
	{ key: MediaType.TV, label: "TV Shows" },
	{ key: MediaType.MOVIE, label: "Movies" },
];
const SKELETONS = [0, 1, 2];

/** One tab's list — mounted only while active, so the other tab doesn't fetch */
function HistoryList({ mediaType }: { mediaType: MediaType }) {
	const navigation = useNavigation<Nav>();
	const { cards, loading, loadingMore, hasMore, error, loadMore } = useWatchHistory(mediaType);
	const shimmer = useSharedShimmer();

	const renderItem = useCallback(
		({ item }: { item: HistoryCard }) => (
			<HistoryCardView
				card={item}
				onPress={() =>
					navigation.navigate(Route.SHOW_DETAIL, { tmdbId: item.tmdbId, mediaType: item.mediaType })
				}
			/>
		),
		[navigation],
	);

	if (loading) {
		return (
			<View style={styles.list}>
				{SKELETONS.map((i) => (
					<View key={i} style={i > 0 ? { marginTop: 16 } : undefined}>
						<HistoryCardSkeleton shimmer={shimmer} />
					</View>
				))}
			</View>
		);
	}

	if (cards.length === 0) {
		return <Text style={styles.empty}>{error ?? "Nothing watched yet"}</Text>;
	}

	return (
		<LegendList
			data={cards}
			keyExtractor={(c) => c.id}
			renderItem={renderItem}
			estimatedItemSize={210}
			contentContainerStyle={styles.list}
			ItemSeparatorComponent={() => <View style={styles.separator} />}
			onEndReached={hasMore ? loadMore : undefined}
			onEndReachedThreshold={0.6}
			recycleItems
			ListFooterComponent={
				<View style={styles.footer}>
					{loadingMore && <ActivityIndicator color={colors.primary} />}
				</View>
			}
		/>
	);
}

/** Watch History: TV Shows | Movies, most recently watched first (no tab bar) */
export default function WatchHistoryScreen() {
	const navigation = useNavigation<Nav>();
	const { top } = useSafeAreaInsets();
	const [tab, setTab] = useState<MediaType>(MediaType.TV);

	return (
		<View style={styles.container}>
			<View style={[styles.topBar, { paddingTop: top + 8 }]}>
				<View style={styles.titleRow}>
					<CircleBackButton tone={CircleButtonTone.SURFACE_LIGHT} onPress={() => navigation.goBack()} />
					<Text style={styles.title}>Hall of Shame</Text>
					{/* Mirrors the back button so the title is centred on the bar */}
					<View style={styles.backSpacer} />
				</View>
				<SlidingTabs
					tabs={TABS}
					activeKey={tab}
					onTabPress={(key) => setTab(key as MediaType)}
					style={styles.tabs}
				/>
			</View>
			<View style={styles.listArea}>
				<HistoryList key={tab} mediaType={tab} />
				{/* Cards fade out under the bar instead of being cut off */}
				<LinearGradient
					colors={[colors.background, `${colors.background}00`]}
					style={styles.topFade}
					pointerEvents="none"
				/>
			</View>
		</View>
	);
}
