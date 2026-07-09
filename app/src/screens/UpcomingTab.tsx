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
import { useUpcomingEpisodes } from "../hooks/useUpcomingEpisodes";
import { markEpisodeWatched, stopWatching } from "../services/firestore";
import EpisodeCard from "../components/EpisodeCard";
import { colors, spacing, typography } from "../theme";
import { UpcomingEpisode, HomeStackParamList, WatchlistItem } from "../types";

type NavProp = NativeStackNavigationProp<HomeStackParamList, "HomeTabs">;

type ListItem =
  | { type: "header"; date: string }
  | { type: "episode"; episode: UpcomingEpisode };

export default function UpcomingTab() {
  const user = useAuthStore((s) => s.user);
  const { items: watchlist } = useWatchlist(user?.uid);
  const navigation = useNavigation<NavProp>();

  const tvShowIds = useMemo(
    () =>
      watchlist
        .filter(
          (w) =>
            w.mediaType === "tv" &&
            (w.status === "watching" || w.status === "rewatching")
        )
        .map((w) => w.tmdbId),
    [watchlist]
  );

  const {
    data: episodes,
    isLoading,
    loadOlderEpisodes,
    loadNewerEpisodes,
    loadingOlder,
    loadingNewer,
  } = useUpcomingEpisodes(tvShowIds);

  const { listData, todayIndex } = useMemo(() => {
    if (!episodes || episodes.length === 0)
      return { listData: [] as ListItem[], todayIndex: 0 };

    const grouped = new Map<string, UpcomingEpisode[]>();
    for (const ep of episodes) {
      const existing = grouped.get(ep.airDate) || [];
      existing.push(ep);
      grouped.set(ep.airDate, existing);
    }

    const result: ListItem[] = [];
    const today = new Date().toISOString().split("T")[0];
    let todayIdx = 0;
    let foundToday = false;

    for (const [date, eps] of grouped) {
      if (!foundToday && date >= today) {
        todayIdx = result.length;
        foundToday = true;
      }
      result.push({ type: "header", date });
      for (const ep of eps) {
        result.push({ type: "episode", episode: ep });
      }
    }

    if (!foundToday) todayIdx = result.length - 1;

    return { listData: result, todayIndex: todayIdx };
  }, [episodes]);

  const watchlistMap = useMemo(() => {
    const map = new Map<number, WatchlistItem>();
    for (const w of watchlist) {
      map.set(w.tmdbId, w);
    }
    return map;
  }, [watchlist]);

  const handleMarkWatched = useCallback(
    async (ep: UpcomingEpisode) => {
      if (!user?.uid) return;
      const wItem = watchlistMap.get(ep.tmdbShowId);
      if (!wItem) return;

      await markEpisodeWatched(
        user.uid,
        ep.tmdbShowId,
        ep.season,
        ep.episode,
        ep.episodeTitle,
        ep.runtime || 0,
        { season: ep.season, episode: ep.episode + 1 },
        false
      );
    },
    [user?.uid, watchlistMap]
  );

  const handleStopWatching = useCallback(
    async (ep: UpcomingEpisode) => {
      if (!user?.uid) return;
      const wItem = watchlistMap.get(ep.tmdbShowId);
      if (!wItem) return;
      await stopWatching(user.uid, ep.tmdbShowId, wItem.status);
    },
    [user?.uid, watchlistMap]
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.getTime() === today.getTime()) return "Today";
    if (date.getTime() === tomorrow.getTime()) return "Tomorrow";
    if (date.getTime() === yesterday.getTime()) return "Yesterday";

    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  };

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "header") {
        return (
          <View style={styles.header}>
            <Text style={styles.headerText}>{formatDate(item.date)}</Text>
          </View>
        );
      }

      return (
        <EpisodeCard
          episode={item.episode}
          onSwipeLeft={() => handleMarkWatched(item.episode)}
          onSwipeRight={() => handleStopWatching(item.episode)}
          onPress={() =>
            navigation.navigate("ShowDetail", {
              tmdbId: item.episode.tmdbShowId,
              mediaType: "tv",
            })
          }
          onCheckmark={() => handleMarkWatched(item.episode)}
        />
      );
    },
    [handleMarkWatched, handleStopWatching, navigation]
  );

  const listRef = useRef<FlatList>(null);
  const didScrollToToday = useRef(false);

  useEffect(() => {
    if (listData.length > 0 && todayIndex > 0 && !didScrollToToday.current) {
      didScrollToToday.current = true;
      setTimeout(() => {
        listRef.current?.scrollToIndex({
          index: todayIndex,
          animated: false,
          viewPosition: 0,
        });
      }, 300);
    }
  }, [listData.length, todayIndex]);

  const renderFooter = useCallback(() => {
    if (!loadingNewer) return null;
    return (
      <View style={styles.loaderRow}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }, [loadingNewer]);

  const renderHeader = useCallback(() => {
    if (!loadingOlder) return null;
    return (
      <View style={styles.loaderRow}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }, [loadingOlder]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
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
      ref={listRef}
      data={listData}
      keyExtractor={(item, index) =>
        item.type === "header"
          ? `header_${item.date}`
          : `ep_${item.episode.tmdbShowId}_S${item.episode.season}E${item.episode.episode}`
      }
      renderItem={renderItem}
      getItemLayout={(_, index) => ({
        length: 70,
        offset: 70 * index,
        index,
      })}
      onScrollToIndexFailed={(info) => {
        listRef.current?.scrollToOffset({
          offset: info.averageItemLength * info.index,
          animated: false,
        });
      }}
      onScroll={(e) => {
        if (e.nativeEvent.contentOffset.y < 100) {
          loadOlderEpisodes();
        }
      }}
      scrollEventThrottle={400}
      onEndReached={loadNewerEpisodes}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={renderHeader}
      ListFooterComponent={renderFooter}
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
    paddingBottom: spacing.xl,
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
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  headerText: {
    ...typography.subtitle,
    color: colors.textSecondary,
    textTransform: "uppercase",
    fontSize: 12,
    letterSpacing: 1,
  },
  loaderRow: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
});
