import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import LoadingSpinner from "../components/LoadingSpinner";
import { useNavigation } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../stores/authStore";
import { useUiStore } from "../stores/uiStore";
import { useWatchlist, EnrichedTrackingItem, useWatchedEpisodes, isShowVisible, sortByPriority } from "../hooks";
import { markEpisodeWatched, stopWatching, getCatalogShow } from "../services/firestore";
import ShowCard from "../components/ShowCard";
import { colors, spacing, typography, posterSize } from "../theme";
import { WatchedEpisode, HomeStackParamList } from "../types";

type NavProp = NativeStackNavigationProp<HomeStackParamList, "HomeTabs">;

type ListItem =
  | { type: "sectionHeader"; title: string }
  | { type: "show"; item: EnrichedTrackingItem }
  | { type: "watchedEpisode"; episode: WatchedEpisode; show: EnrichedTrackingItem };

export default function WatchlistTab() {
  const user = useAuthStore((s) => s.user);
  const { items, loading, loadMore: loadMoreTracking, loadingMore: loadingMoreTracking, hasMore: hasMoreTracking } = useWatchlist(user?.uid);
  const { episodes: watchedEps, loadMore: loadMoreEps, loadingMore: loadingMoreEps, hasMore: hasMoreEps } = useWatchedEpisodes(user?.uid);
  const navigation = useNavigation<NavProp>();
  const queryClient = useQueryClient();
  const [updatingShows, setUpdatingShows] = useState<Map<number, string>>(new Map());

  const showMap = useMemo(() => {
    const map = new Map<number, EnrichedTrackingItem>();
    for (const item of items) map.set(item.tmdbId, item);
    return map;
  }, [items]);

  const watchedCountByShow = useMemo(() => {
    const map = new Map<number, number>();
    for (const ep of watchedEps) {
      map.set(ep.tmdbShowId, (map.get(ep.tmdbShowId) || 0) + 1);
    }
    return map;
  }, [watchedEps]);

  const sortedWatchedEps = useMemo(
    () =>
      [...watchedEps].sort((a, b) => {
        const aTime = a.lastWatchedAt?.toMillis?.() || 0;
        const bTime = b.lastWatchedAt?.toMillis?.() || 0;
        return aTime - bTime; // oldest first, newest at bottom (near Currently Watching)
      }),
    [watchedEps]
  );

  const sortedActive = useMemo(() => {
    const visible = items.filter((item) => isShowVisible(item));
    return sortByPriority(visible);
  }, [items]);

  // Auto-load more if too few visible items
  useEffect(() => {
    if (!loading && hasMoreTracking && !loadingMoreTracking && sortedActive.length < 10 && items.length > 0) {
      loadMoreTracking();
    }
  }, [loading, hasMoreTracking, loadingMoreTracking, sortedActive.length, items.length, loadMoreTracking]);

  const watchedItemCount = useMemo(() => {
    return sortedWatchedEps.filter((ep) => showMap.has(ep.tmdbShowId)).length;
  }, [sortedWatchedEps, showMap]);

  const listData: ListItem[] = useMemo(() => {
    const result: ListItem[] = [];
    if (sortedWatchedEps.length > 0) {
      result.push({ type: "sectionHeader", title: "Previously Watched" });
      for (const ep of sortedWatchedEps) {
        const show = showMap.get(ep.tmdbShowId);
        if (show) {
          result.push({ type: "watchedEpisode", episode: ep, show });
        }
      }
    }
    if (sortedActive.length > 0) {
      result.push({ type: "sectionHeader", title: "Currently Watching" });
      for (const item of sortedActive) {
        result.push({ type: "show", item });
      }
    }
    return result;
  }, [sortedWatchedEps, sortedActive, showMap]);

  // Estimate height of Previously Watched section for initial scroll offset
  // sectionHeader ~40px, each watched episode ~98px + 1px separator
  const prevWatchedOffset = useMemo(() => {
    if (watchedItemCount === 0) return 0;
    return 40 + watchedItemCount * 99;
  }, [watchedItemCount]);

  const listRef = useRef<FlatList<ListItem>>(null);
  const hasScrolledRef = useRef(false);


  const handleMarkWatched = useCallback(
    async (item: EnrichedTrackingItem) => {
      if (!user?.uid) return;

      // If no nextEpisode set, default to S01E01
      const currentEp = item.nextEpisode ?? { season: 1, episode: 1 };
      const epKey = `${currentEp.season}-${currentEp.episode}`;
      setUpdatingShows((prev) => new Map(prev).set(item.tmdbId, epKey));

      const catalog = item.catalogShow ?? await getCatalogShow(item.tmdbId);

      const catalogSeason = catalog?.seasons?.find(
        (s) => s.seasonNumber === currentEp.season
      );
      const catalogEp = catalogSeason?.episodes?.find(
        (e) => e.episodeNumber === currentEp.episode
      );
      const nextEpInSeason = catalogSeason?.episodes?.find(
        (e) => e.episodeNumber === currentEp.episode + 1
      );

      let nextEpisode: { season: number; episode: number } | null = null;
      let isComplete = false;

      if (nextEpInSeason) {
        nextEpisode = {
          season: currentEp.season,
          episode: nextEpInSeason.episodeNumber,
        };
      } else {
        const nextCatalogSeason = catalog?.seasons?.find(
          (s) => s.seasonNumber === currentEp.season + 1
        );
        if (nextCatalogSeason && nextCatalogSeason.episodes.length > 0) {
          nextEpisode = {
            season: currentEp.season + 1,
            episode: 1,
          };
        } else {
          isComplete = true;
        }
      }

      await markEpisodeWatched(
        user.uid,
        item.tmdbId,
        currentEp.season,
        currentEp.episode,
        catalogEp?.title || "",
        catalogEp?.runtime || 0,
        nextEpisode,
        isComplete
      );
      queryClient.invalidateQueries({ queryKey: ["watchedEpisodes", user.uid] });
    },
    [user?.uid, queryClient]
  );

  // Clear updating state when nextEpisode actually changes
  useEffect(() => {
    if (updatingShows.size === 0) return;
    setUpdatingShows((prev) => {
      const next = new Map(prev);
      for (const [tmdbId, markedEpKey] of prev) {
        const item = items.find((i) => i.tmdbId === tmdbId);
        if (!item) {
          next.delete(tmdbId);
        } else {
          const ep = item.nextEpisode ?? { season: 1, episode: 1 };
          const currentKey = `${ep.season}-${ep.episode}`;
          if (currentKey !== markedEpKey) next.delete(tmdbId);
        }
      }
      return next.size === prev.size ? prev : next;
    });
  }, [items, updatingShows]);

  const handleStopWatching = useCallback(
    async (item: EnrichedTrackingItem) => {
      if (!user?.uid) return;
      await stopWatching(user.uid, item.tmdbId, item.status);
    },
    [user?.uid]
  );

  const handlePress = useCallback(
    (tmdbId: number, mediaType: "tv" | "movie") => {
      navigation.navigate("ShowDetail", { tmdbId, mediaType });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "sectionHeader") {
        return (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{item.title}</Text>
          </View>
        );
      }

      if (item.type === "watchedEpisode") {
        const label = `S${String(item.episode.season).padStart(2, "0")}E${String(item.episode.episode).padStart(2, "0")}`;
        return (
          <TouchableOpacity
            style={[styles.epContainer, styles.watchedContainer]}
            onPress={() => handlePress(item.episode.tmdbShowId, "tv")}
            activeOpacity={0.8}
          >
            <Image
              source={{ uri: `${posterSize.small}${item.show.posterPath}` }}
              style={[styles.epPoster, styles.watchedPoster]}
              contentFit="cover"
            />
            <View style={styles.epInfo}>
              <Text style={[styles.epShowTitle, styles.watchedText]} numberOfLines={1}>
                {item.show.title}
              </Text>
              <Text style={[styles.epLabel, styles.watchedText]}>{label}</Text>
              <Text style={[styles.epTitle, styles.watchedText]} numberOfLines={1}>
                {item.episode.episodeTitle}
              </Text>
            </View>
            <View style={styles.watchedBadge}>
              <Text style={styles.watchedBadgeText}>✓</Text>
            </View>
          </TouchableOpacity>
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
    [handleMarkWatched, handleStopWatching, handlePress, watchedCountByShow, updatingShows]
  );


  const screenHeight = Dimensions.get("window").height;
  const isLoading = loading;
  const setWatchlistLoading = useUiStore((s) => s.setWatchlistLoading);

  useEffect(() => {
    setWatchlistLoading(isLoading);
  }, [isLoading, setWatchlistLoading]);

  // Scroll past Previously Watched once list appears
  useEffect(() => {
    if (!hasScrolledRef.current && !isLoading && prevWatchedOffset > 0) {
      hasScrolledRef.current = true;
      setTimeout(() => {
        listRef.current?.scrollToOffset({ offset: prevWatchedOffset, animated: false });
      }, 300);
    }
  }, [isLoading, prevWatchedOffset]);

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
      contentContainerStyle={[styles.listContent, { minHeight: screenHeight + prevWatchedOffset }]}
    />
  );
}

const SeparatorComponent = () => (
  <View style={{ height: 1, backgroundColor: colors.border }} />
);

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
  loaderRow: {
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  epContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  watchedContainer: {
    opacity: 0.4,
  },
  epPoster: {
    width: 55,
    height: 82,
    borderRadius: 4,
  },
  watchedPoster: {
    opacity: 0.6,
  },
  epInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  epShowTitle: {
    ...typography.subtitle,
  },
  epLabel: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  epTitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  watchedText: {
    color: colors.textMuted,
  },
  watchedBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.watchedGreen,
    justifyContent: "center",
    alignItems: "center",
    opacity: 0.6,
  },
  watchedBadgeText: {
    fontSize: 18,
    color: colors.text,
    fontWeight: "700",
  },
});
