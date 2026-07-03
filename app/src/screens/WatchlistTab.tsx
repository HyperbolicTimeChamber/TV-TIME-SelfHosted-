import React, { useCallback, useMemo } from "react";
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
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

  const activeItems = useMemo(() => {
    return items.filter(
      (item) =>
        item.status === "watching" ||
        item.status === "rewatching" ||
        item.status === "plan_to_watch"
    );
  }, [items]);

  const sortedItems = useMemo(() => {
    return [...activeItems].sort((a, b) => {
      const aTime = a.lastWatchedAt?.toMillis() || 0;
      const bTime = b.lastWatchedAt?.toMillis() || 0;
      return bTime - aTime;
    });
  }, [activeItems]);

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

  const renderItem = useCallback(
    ({ item }: { item: WatchlistItem }) => (
      <ShowCard
        item={item}
        onSwipeLeft={() => handleMarkWatched(item)}
        onSwipeRight={() => handleStopWatching(item)}
        onPress={() => handlePress(item)}
        onCheckmark={() => handleMarkWatched(item)}
      />
    ),
    [handleMarkWatched, handleStopWatching, handlePress]
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (sortedItems.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>No shows in your watchlist</Text>
        <Text style={styles.emptyHint}>Search to add shows</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={sortedItems}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
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
});
