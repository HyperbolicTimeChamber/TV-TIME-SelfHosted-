import React, { useCallback, useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../stores/authStore";
import { useWatchlist } from "../hooks/useWatchlist";
import { markEpisodeWatched, stopWatching } from "../services/firestore";
import { getSeasonDetails } from "../services/tmdb";
import ShowCard from "../components/ShowCard";
import { colors, spacing, typography } from "../theme";
import { WatchlistItem, HomeStackParamList } from "../types";

type NavProp = NativeStackNavigationProp<HomeStackParamList, "HomeTabs">;

export default function WatchlistTab() {
  const user = useAuthStore((s) => s.user);
  const apiKey = useAuthStore((s) => s.tmdbApiKey)!;
  const { items, loading } = useWatchlist(user?.uid);
  const navigation = useNavigation<NavProp>();

  const { completedItems, activeItems } = useMemo(() => {
    const active: WatchlistItem[] = [];
    const completed: WatchlistItem[] = [];
    for (const item of items) {
      if (
        item.status === "watching" ||
        item.status === "rewatching" ||
        item.status === "plan_to_watch"
      ) {
        active.push(item);
      } else {
        completed.push(item);
      }
    }
    return { completedItems: completed, activeItems: active };
  }, [items]);

  const sortByLastWatched = (list: WatchlistItem[]) =>
    [...list].sort((a, b) => {
      const aTime = a.lastWatchedAt?.toMillis() || 0;
      const bTime = b.lastWatchedAt?.toMillis() || 0;
      return bTime - aTime;
    });


  const handleMarkWatched = useCallback(
    async (item: WatchlistItem) => {
      if (!user?.uid || !item.nextEpisode) return;

      const seasonData = await getSeasonDetails(
        apiKey,
        item.tmdbId,
        item.nextEpisode.season
      );
      const season = seasonData as {
        episodes: Array<{
          episode_number: number;
          name: string;
          runtime: number | null;
          season_number: number;
        }>;
      };

      const currentEp = season.episodes.find(
        (e) => e.episode_number === item.nextEpisode!.episode
      );
      const nextEpInSeason = season.episodes.find(
        (e) => e.episode_number === item.nextEpisode!.episode + 1
      );

      let nextEpisode: { season: number; episode: number } | null = null;
      let isComplete = false;

      if (nextEpInSeason) {
        nextEpisode = {
          season: item.nextEpisode.season,
          episode: nextEpInSeason.episode_number,
        };
      } else {
        try {
          const nextSeasonData = await getSeasonDetails(
            apiKey,
            item.tmdbId,
            item.nextEpisode.season + 1
          );
          const nextSeason = nextSeasonData as {
            episodes: Array<{ episode_number: number }>;
          };
          if (nextSeason.episodes && nextSeason.episodes.length > 0) {
            nextEpisode = {
              season: item.nextEpisode.season + 1,
              episode: 1,
            };
          } else {
            isComplete = true;
          }
        } catch {
          isComplete = true;
        }
      }

      await markEpisodeWatched(
        user.uid,
        item.tmdbId,
        item.nextEpisode.season,
        item.nextEpisode.episode,
        currentEp?.name || "",
        currentEp?.runtime || 0,
        nextEpisode,
        isComplete
      );
    },
    [user?.uid, apiKey]
  );

  const handleStopWatching = useCallback(
    async (item: WatchlistItem) => {
      if (!user?.uid) return;
      await stopWatching(user.uid, item.tmdbId, item.status);
    },
    [user?.uid]
  );

  const handlePress = useCallback(
    (item: WatchlistItem) => {
      navigation.navigate("ShowDetail", {
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
      });
    },
    [navigation]
  );

  type ListItem =
    | { type: "sectionHeader"; title: string }
    | { type: "show"; item: WatchlistItem };

  const listData: ListItem[] = useMemo(() => {
    const result: ListItem[] = [];
    const sortedCompleted = sortByLastWatched(completedItems);
    const sortedActive = sortByLastWatched(activeItems);

    if (sortedCompleted.length > 0) {
      result.push({ type: "sectionHeader", title: "Previously Watched" });
      for (const item of sortedCompleted) {
        result.push({ type: "show", item });
      }
    }
    if (sortedActive.length > 0) {
      result.push({ type: "sectionHeader", title: "Currently Watching" });
      for (const item of sortedActive) {
        result.push({ type: "show", item });
      }
    }
    return result;
  }, [completedItems, activeItems]);

  const activeHeaderIndex = useMemo(() => {
    return listData.findIndex(
      (d) => d.type === "sectionHeader" && d.title === "Currently Watching"
    );
  }, [listData]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "sectionHeader") {
        return (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{item.title}</Text>
          </View>
        );
      }
      return (
        <ShowCard
          item={item.item}
          onSwipeLeft={() => handleMarkWatched(item.item)}
          onSwipeRight={() => handleStopWatching(item.item)}
          onPress={() => handlePress(item.item)}
          onCheckmark={() => handleMarkWatched(item.item)}
        />
      );
    },
    [handleMarkWatched, handleStopWatching, handlePress]
  );

  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (listData.length > 0 && activeHeaderIndex > 0) {
      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: activeHeaderIndex,
          animated: false,
          viewPosition: 0,
        });
      }, 300);
    }
  }, [listData.length, activeHeaderIndex]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
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
      keyExtractor={(item, index) =>
        item.type === "sectionHeader"
          ? `section_${item.title}`
          : `show_${item.item.id}`
      }
      renderItem={renderItem}
      getItemLayout={(_, index) => ({
        length: 80,
        offset: 80 * index,
        index,
      })}
      onScrollToIndexFailed={(info) => {
        listRef.current?.scrollToOffset({
          offset: info.averageItemLength * info.index,
          animated: false,
        });
      }}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
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
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  sectionHeaderText: {
    ...typography.subtitle,
    color: colors.textSecondary,
    textTransform: "uppercase",
    fontSize: 12,
    letterSpacing: 1,
  },
});
