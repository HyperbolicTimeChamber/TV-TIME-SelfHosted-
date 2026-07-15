import React, { useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { LegendList } from "@legendapp/list/react-native";
import { Image } from "expo-image";
import LoadingSpinner from "../components/LoadingSpinner";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../stores/authStore";
import { useUpcomingEpisodes } from "../hooks/useUpcomingEpisodes";
import { colors, spacing, typography, posterSize } from "../theme";
import { UpcomingEpisode, HomeStackParamList } from "../types";

type NavProp = NativeStackNavigationProp<HomeStackParamList, "HomeTabs">;

type ListItem =
  | { type: "header"; date: string }
  | { type: "episode"; episode: UpcomingEpisode };

export default function UpcomingTab() {
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation<NavProp>();

  const {
    data: episodes,
    isLoading,
    loadMore,
    loadingMore,
  } = useUpcomingEpisodes(user?.uid);

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  const listData = useMemo(() => {
    if (!episodes || episodes.length === 0) return [] as ListItem[];

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

      const ep = item.episode;
      const label = `S${String(ep.season).padStart(2, "0")}E${String(ep.episode).padStart(2, "0")}`;

      return (
        <TouchableOpacity
          style={styles.episodeRow}
          onPress={() =>
            navigation.navigate("ShowDetail", {
              tmdbId: ep.tmdbShowId,
              mediaType: "tv",
            })
          }
          activeOpacity={0.8}
        >
          {ep.posterPath ? (
            <Image
              source={{ uri: `${posterSize.small}${ep.posterPath}` }}
              style={styles.poster}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.poster, styles.noPoster]}>
              <Text style={styles.noPosterText}>?</Text>
            </View>
          )}
          <View style={styles.info}>
            <Text style={styles.showTitle} numberOfLines={1}>
              {ep.showTitle}
            </Text>
            <Text style={styles.epLabel}>{label}</Text>
            <Text style={styles.epTitle} numberOfLines={1}>
              {ep.episodeTitle}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [navigation]
  );

  const listRef = useRef<any>(null);

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
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.loaderRow}>
            <LoadingSpinner />
          </View>
        ) : null
      }
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
  episodeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  poster: {
    width: 45,
    height: 67,
    borderRadius: 4,
  },
  noPoster: {
    backgroundColor: colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  noPosterText: {
    ...typography.subtitle,
    color: colors.textMuted,
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
  },
  showTitle: {
    ...typography.subtitle,
    fontSize: 14,
  },
  epLabel: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  epTitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontSize: 13,
  },
  loaderRow: {
    paddingVertical: spacing.xl,
    alignItems: "center",
  },
});
