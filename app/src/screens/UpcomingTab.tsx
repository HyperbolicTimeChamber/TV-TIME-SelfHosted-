import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { LegendList } from "@legendapp/list/react-native";
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

  const { data: episodes, isLoading } = useUpcomingEpisodes(tvShowIds);

  const listData: ListItem[] = useMemo(() => {
    if (!episodes) return [];
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

    if (date.getTime() === today.getTime()) return "Today";
    if (date.getTime() === tomorrow.getTime()) return "Tomorrow";

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
    <LegendList
      data={listData}
      keyExtractor={(item, index) =>
        item.type === "header"
          ? `header_${item.date}`
          : `ep_${item.episode.tmdbShowId}_${item.episode.season}_${item.episode.episode}`
      }
      renderItem={renderItem}
      estimatedItemSize={70}
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
});
