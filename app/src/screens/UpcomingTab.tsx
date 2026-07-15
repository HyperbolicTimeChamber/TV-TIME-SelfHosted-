import React, { useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
} from "react-native";
import { LegendList } from "@legendapp/list/react-native";
import LoadingSpinner from "../components/LoadingSpinner";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../stores/authStore";
import { useWatchlist } from "../hooks/useWatchlist";
import { useUpcomingEpisodes } from "../hooks/useUpcomingEpisodes";
import { useWatchedEpisodes } from "../hooks/useWatchedEpisodes";
import { markEpisodeWatched, stopWatching } from "../services/firestore";
import EpisodeCard from "../components/EpisodeCard";
import { colors, spacing, typography } from "../theme";
import { UpcomingEpisode, HomeStackParamList, TrackingItem } from "../types";

type NavProp = NativeStackNavigationProp<HomeStackParamList, "HomeTabs">;

type ListItem =
  | { type: "header"; date: string }
  | { type: "episode"; episode: UpcomingEpisode };

export default function UpcomingTab() {
  const user = useAuthStore((s) => s.user);
  const { items: watchlist, loading: watchlistLoading } = useWatchlist(user?.uid);
  const navigation = useNavigation<NavProp>();

  const tvShows = useMemo(
    () =>
      watchlist.filter(
        (w) =>
          w.mediaType === "tv" &&
          (w.status === "watching" || w.status === "rewatching")
      ),
    [watchlist]
  );

  const { episodes: watchedEps } = useWatchedEpisodes(user?.uid);
  const watchedSetRef = useRef(new Set<string>());
  watchedSetRef.current = useMemo(() => {
    const set = new Set<string>();
    for (const ep of watchedEps) {
      set.add(`${ep.tmdbShowId}_S${ep.season}E${ep.episode}`);
    }
    return set;
  }, [watchedEps]);

  const {
    data: episodes,
    isLoading,
  } = useUpcomingEpisodes(tvShows);

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  const listData = useMemo(() => {
    if (!episodes || episodes.length === 0) return [] as ListItem[];

    // Filter to today and future only
    const futureEps = episodes.filter((ep) => ep.airDate >= today);

    const grouped = new Map<string, UpcomingEpisode[]>();
    for (const ep of futureEps) {
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
  }, [episodes, today]);

  const watchlistMap = useMemo(() => {
    const map = new Map<number, TrackingItem>();
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
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.getTime() === now.getTime()) return "Today";
    if (date.getTime() === tomorrow.getTime()) return "Tomorrow";

    const sameYear = date.getFullYear() === now.getFullYear();
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
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

      const epKey = `${item.episode.tmdbShowId}_S${item.episode.season}E${item.episode.episode}`;
      const isWatched = watchedSetRef.current.has(epKey);

      return (
        <EpisodeCard
          episode={item.episode}
          isWatched={isWatched}
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

  const listRef = useRef<any>(null);

  const renderFooter = useCallback(() => (
    <View style={styles.loaderRow}>
      <View style={styles.loaderPlaceholder} />
    </View>
  ), []);

  if (isLoading || watchlistLoading) {
    return (
      <View style={styles.center}>
        <LoadingSpinner />
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
      ref={listRef}
      data={listData}
      keyExtractor={(item) =>
        item.type === "header"
          ? `header_${item.date}`
          : `ep_${item.episode.tmdbShowId}_S${item.episode.season}E${item.episode.episode}`
      }
      renderItem={renderItem}
      extraData={watchedEps.length}
      ListFooterComponent={renderFooter}
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
  loaderRow: {
    paddingVertical: spacing.xl,
    alignItems: "center",
    backgroundColor: colors.background,
  },
  loaderPlaceholder: {
    height: 20,
  },
});
