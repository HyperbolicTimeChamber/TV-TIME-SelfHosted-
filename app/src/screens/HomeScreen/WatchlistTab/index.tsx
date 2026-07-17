import { useCallback, useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Alert,
} from "react-native";
import { useNavigation, CompositeNavigationProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useAuthStore, useUiStore } from "../../../stores";
import { LoadingSpinner, ShowCard, WatchActionSheet } from "../../../components";
import type { WatchAction } from "../../../components";
import {
  markEpisodeWatched,
  unmarkEpisodeWatched,
  decrementEpisodeWatchCount,
  getCatalogShow,
} from "../../../services";
import { colors, spacing, typography } from "../../../theme";
import { HomeStackParamList, MainTabParamList, WatchedEpisode, MediaType, Route } from "../../../types";
import { ListItem } from "./types";
import { useWatchlistData } from "./useWatchlistData";
import WatchedEpisodeRow from "./WatchedEpisodeRow";
import SectionHeader from "./SectionHeader";

type NavProp = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, Route.HOME_TABS>,
  BottomTabNavigationProp<MainTabParamList>
>;

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

  // Action sheet state for previously watched episodes
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetEpisode, setSheetEpisode] = useState<WatchedEpisode | null>(null);

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
    (tmdbId: number, mediaType: MediaType) => {
      navigation.navigate(Route.SHOW_DETAIL, { tmdbId, mediaType });
    },
    [navigation],
  );

  const handleWatchedCheckmark = useCallback((episode: WatchedEpisode) => {
    setSheetEpisode(episode);
    setSheetVisible(true);
  }, []);

  const handleSheetAction = useCallback(
    async (action: WatchAction) => {
      if (!user?.uid || !sheetEpisode) return;

      try {
        if (action === "rewatch") {
          const catalog = await getCatalogShow(sheetEpisode.tmdbShowId);
          const catalogSeason = catalog?.seasons?.find(
            (s) => s.seasonNumber === sheetEpisode.season,
          );
          const catalogEp = catalogSeason?.episodes?.find(
            (e) => e.episodeNumber === sheetEpisode.episode,
          );
          const nextEpInSeason = catalogSeason?.episodes?.find(
            (e) => e.episodeNumber === sheetEpisode.episode + 1,
          );

          let nextEpisode: { season: number; episode: number } | null = null;
          let isComplete = false;

          if (nextEpInSeason) {
            nextEpisode = {
              season: sheetEpisode.season,
              episode: nextEpInSeason.episodeNumber,
            };
          } else {
            const nextCatalogSeason = catalog?.seasons?.find(
              (s) => s.seasonNumber === sheetEpisode.season + 1,
            );
            if (nextCatalogSeason && nextCatalogSeason.episodes.length > 0) {
              nextEpisode = { season: sheetEpisode.season + 1, episode: 1 };
            } else {
              isComplete = true;
            }
          }

          await markEpisodeWatched(
            user.uid,
            sheetEpisode.tmdbShowId,
            sheetEpisode.season,
            sheetEpisode.episode,
            catalogEp?.title || sheetEpisode.episodeTitle,
            catalogEp?.runtime || sheetEpisode.runtime,
            nextEpisode,
            isComplete,
          );
        } else if (action === "not_watched") {
          await unmarkEpisodeWatched(
            user.uid,
            sheetEpisode.tmdbShowId,
            sheetEpisode.season,
            sheetEpisode.episode,
            sheetEpisode.runtime,
          );
        } else if (action === "watched_once_less") {
          await decrementEpisodeWatchCount(
            user.uid,
            sheetEpisode.tmdbShowId,
            sheetEpisode.season,
            sheetEpisode.episode,
            sheetEpisode.runtime,
            sheetEpisode.watchCount,
          );
        }
      } catch (err: any) {
        console.error("Watch action failed:", err);
        Alert.alert("Error", err.message || "Action failed.");
      }

      setSheetEpisode(null);
    },
    [user?.uid, sheetEpisode],
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
            onPress={(id) => handlePress(id, MediaType.TV)}
            onCheckmarkPress={handleWatchedCheckmark}
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
    [handleMarkWatched, handleStopWatching, handlePress, watchedCountByShow, updatingShows, handleWatchedCheckmark],
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
        <TouchableOpacity
          style={styles.addShowsButton}
          onPress={() => navigation.navigate(Route.SEARCH)}
        >
          <Text style={styles.addShowsText}>+ Add Shows</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sheetLabel = sheetEpisode
    ? `S${String(sheetEpisode.season).padStart(2, "0")}E${String(sheetEpisode.episode).padStart(2, "0")} - ${sheetEpisode.episodeTitle}`
    : "";

  return (
    <>
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
      <WatchActionSheet
        visible={sheetVisible}
        label={sheetLabel}
        watchCount={sheetEpisode?.watchCount || 0}
        onSelect={handleSheetAction}
        onClose={() => {
          setSheetVisible(false);
          setSheetEpisode(null);
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
  addShowsButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 8,
  },
  addShowsText: {
    ...typography.subtitle,
    fontSize: 14,
    color: colors.text,
  },
  loaderRow: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
});
