import { useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore, useUiStore } from "../../../stores";
import { LoadingSpinner, ShowCard } from "../../../components";
import { colors, spacing, typography } from "../../../theme";
import { HomeStackParamList } from "../../../types";
import { ListItem } from "./types";
import { useWatchlistData } from "./useWatchlistData";
import WatchedEpisodeRow from "./WatchedEpisodeRow";
import SectionHeader from "./SectionHeader";

type NavProp = NativeStackNavigationProp<HomeStackParamList, "HomeTabs">;

const SeparatorComponent = () => (
  <View style={{ height: 1, backgroundColor: colors.border }} />
);

export default function WatchlistTab() {
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation<NavProp>();

  const {
    listData,
    loading,
    loadMoreTracking,
    loadingMoreTracking,
    loadMoreEps,
    loadingMoreEps,
    hasMoreEps,
    prevWatchedOffset,
    watchedCountByShow,
    updatingShows,
    handleMarkWatched,
    handleStopWatching,
  } = useWatchlistData(user?.uid);

  const listRef = useRef<FlatList<ListItem>>(null);
  const hasScrolledRef = useRef(false);

  const screenHeight = Dimensions.get("window").height;
  const isLoading = loading;
  const setWatchlistLoading = useUiStore((s) => s.setWatchlistLoading);

  useEffect(() => {
    setWatchlistLoading(isLoading);
  }, [isLoading, setWatchlistLoading]);

  useEffect(() => {
    if (!hasScrolledRef.current && !isLoading && prevWatchedOffset > 0) {
      hasScrolledRef.current = true;
      setTimeout(() => {
        listRef.current?.scrollToOffset({
          offset: prevWatchedOffset,
          animated: false,
        });
      }, 300);
    }
  }, [isLoading, prevWatchedOffset]);

  const handlePress = useCallback(
    (tmdbId: number, mediaType: "tv" | "movie") => {
      navigation.navigate("ShowDetail", { tmdbId, mediaType });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "sectionHeader") {
        return <SectionHeader title={item.title} />;
      }

      if (item.type === "watchedEpisode") {
        return (
          <WatchedEpisodeRow
            episode={item.episode}
            show={item.show}
            onPress={(id) => handlePress(id, "tv")}
          />
        );
      }

      const watched = watchedCountByShow.get(item.item.tmdbId) || 0;
      const total = item.item.totalEpisodes;
      const remaining = total ? total - watched : null;

      return (
        <ShowCard
          item={item.item}
          isUpdating={updatingShows.has(item.item.tmdbId)}
          remainingEpisodes={remaining}
          onSwipeLeft={() => handleMarkWatched(item.item)}
          onSwipeRight={() => handleStopWatching(item.item)}
          onPress={() => handlePress(item.item.tmdbId, item.item.mediaType)}
          onCheckmark={() => handleMarkWatched(item.item)}
        />
      );
    },
    [handleMarkWatched, handleStopWatching, handlePress, watchedCountByShow, updatingShows],
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <LoadingSpinner />
      </View>
    );
  }

  if (listData.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>No shows in your watchlist</Text>
        <Text style={styles.emptyHint}>Search to add shows</Text>
      </View>
    );
  }

  return (
    <FlatList
      ref={listRef}
      data={listData}
      keyExtractor={(item) => {
        if (item.type === "sectionHeader") return `section_${item.title}`;
        if (item.type === "watchedEpisode") return `watched_${item.episode.id}`;
        return `show_${item.item.id}`;
      }}
      renderItem={renderItem}
      maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
      refreshControl={
        hasMoreEps ? (
          <RefreshControl
            refreshing={loadingMoreEps}
            onRefresh={loadMoreEps}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        ) : undefined
      }
      onEndReached={() => loadMoreTracking()}
      onEndReachedThreshold={1.5}
      ListFooterComponent={
        loadingMoreTracking ? (
          <View style={styles.loaderRow}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : null
      }
      ItemSeparatorComponent={SeparatorComponent}
      removeClippedSubviews
      maxToRenderPerBatch={15}
      windowSize={7}
      style={styles.list}
      contentContainerStyle={[
        styles.listContent,
        { minHeight: screenHeight + prevWatchedOffset },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingVertical: spacing.sm,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  empty: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
  emptyHint: {
    ...typography.caption,
    marginTop: spacing.sm,
  },
  loaderRow: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
});
