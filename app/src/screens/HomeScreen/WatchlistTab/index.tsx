import { useCallback, useRef, useEffect, useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Alert,
} from "react-native";
import { LegendList } from "@legendapp/list/react-native";
import {
  useNavigation,
  CompositeNavigationProp,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useAuthStore, useUiStore } from "../../../stores";
import {
  LoadingSpinner,
  ShowCard,
  WatchActionSheet,
  EpisodeDetailModal,
  ShowDrawer,
} from "../../../components";
import type { WatchAction } from "../../../components";
import {
  markEpisodeWatched,
  unmarkEpisodeWatched,
  decrementEpisodeWatchCount,
  getCatalogShow,
  getSeasonDetails,
  getShowDetails,
} from "../../../services";
import { colors, spacing, typography } from "../../../theme";
import {
  HomeStackParamList,
  MainTabParamList,
  WatchedEpisode,
  MediaType,
  Route,
  QueryKey,
} from "../../../types";
import type { ShowDrawerData } from "../../../components/ShowDrawer";
import {
  warmupWatchlistCFs,
  warmupFirestoreWrite,
} from "../../../services/warmup";
import { Timestamp } from "@react-native-firebase/firestore";
import { insertWatchedEpisodeCache, removeWatchedEpisodeCache } from "../../../hooks";
import { ListItem } from "./types";
import { useWatchlistData } from "./useWatchlistData";
import WatchedEpisodeRow from "./WatchedEpisodeRow";
import SectionHeader from "./SectionHeader";

const SCREEN_HEIGHT = Dimensions.get("window").height;

type NavProp = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, Route.HOME_TABS>,
  BottomTabNavigationProp<MainTabParamList>
>;

const SeparatorComponent = () => <View style={styles.separator} />;
const NOOP_ASYNC = async () => {};
const NOOP_CHECKMARK = async () => {};

export default function WatchlistTab() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const navigation = useNavigation<NavProp>();

  useEffect(() => {
    warmupWatchlistCFs();
    if (user?.uid) warmupFirestoreWrite(user.uid);
  }, [user?.uid]);

  const {
    listData,
    loading,
    loadMoreTracking,
    loadingMoreTracking,
    loadMorePrevWatched,
    loadingMorePrevWatched,
    hasMorePrevWatched,
    prevWatchedOffset,
    watchedCountByShow,
    updatingShows,
    handleMarkWatched,
    handleStopWatching,
  } = useWatchlistData(user?.uid);

  const listRef = useRef<any>(null);

  const isLoading = loading;
  const setWatchlistLoading = useUiStore((s) => s.setWatchlistLoading);

  // Action sheet state for previously watched episodes
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetEpisode, setSheetEpisode] = useState<WatchedEpisode | null>(null);

  // Episode detail modal state
  const [epModalVisible, setEpModalVisible] = useState(false);
  const [epModalData, setEpModalData] = useState<{
    showTitle: string;
    season: number;
    episode: number;
    episodeTitle: string | null;
    overview: string | null;
    stillPath: string | null;
    airDate: string | null;
    runtime: number | null;
    tmdbId: number;
    showPosterPath: string | null;
  } | null>(null);
  const [epModalLoading, setEpModalLoading] = useState(false);
  const [epModalMarking, setEpModalMarking] = useState(false);

  // Show drawer state
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerShow, setDrawerShow] = useState<ShowDrawerData | null>(null);

  useEffect(() => {
    setWatchlistLoading(isLoading);
  }, [isLoading, setWatchlistLoading]);

  // Show Previously Watched briefly, then scroll to What's Up Next
  const hasScrolledRef = useRef(false);
  useEffect(() => {
    if (!hasScrolledRef.current && !isLoading && prevWatchedOffset > 0) {
      hasScrolledRef.current = true;
      setTimeout(() => {
        listRef.current?.scrollToOffset({
          offset: prevWatchedOffset,
          animated: true,
        });
      }, 400);
    }
  }, [isLoading, prevWatchedOffset]);

  const handleNavigateToShow = useCallback(
    (tmdbId: number, mediaType: MediaType) => {
      navigation.navigate(Route.SHOW_DETAIL, { tmdbId, mediaType });
    },
    [navigation],
  );

  const handleCardPress = useCallback(
    async (tmdbId: number, _mediaType: MediaType) => {
      const listItem = listData.find(
        (li) => li.type === "show" && li.item.tmdbId === tmdbId,
      );
      if (!listItem || listItem.type !== "show") return;
      const item = listItem.item;
      const ep = item.nextEpisode;
      if (!ep) return;

      const catalogSeason = item.catalogShow?.seasons?.find(
        (s) => s.seasonNumber === ep.season,
      );
      const catalogEp = catalogSeason?.episodes?.find(
        (e) => e.episodeNumber === ep.episode,
      );
      const hasFullData = !!(catalogEp?.overview && catalogEp?.stillPath);
      setEpModalData({
        showTitle: item.title,
        season: ep.season,
        episode: ep.episode,
        episodeTitle: catalogEp?.title ?? null,
        overview: catalogEp?.overview || null,
        stillPath: catalogEp?.stillPath ?? null,
        airDate: catalogEp?.airDate ?? null,
        runtime: catalogEp?.runtime ?? null,
        tmdbId,
        showPosterPath: item.posterPath ?? null,
      });
      setEpModalLoading(!hasFullData);
      setEpModalMarking(false);
      setEpModalVisible(true);

      // Only fetch TMDB if catalog lacks overview/image
      if (!hasFullData) {
        const apiKey = useAuthStore.getState().appTmdbApiKey;
        if (apiKey)
          try {
            const seasonData = await getSeasonDetails(
              apiKey,
              tmdbId,
              ep.season,
            );
            const tmdbEp = seasonData.episodes?.find(
              (e) => e.episode_number === ep.episode,
            );
            if (tmdbEp) {
              setEpModalData((prev) =>
                prev
                  ? {
                      ...prev,
                      overview: tmdbEp.overview || null,
                      stillPath: tmdbEp.still_path || null,
                      episodeTitle: tmdbEp.name || prev.episodeTitle,
                      airDate: tmdbEp.air_date || prev.airDate,
                      runtime: tmdbEp.runtime || prev.runtime,
                    }
                  : null,
              );
            }
          } catch {}
        setEpModalLoading(false);
      }
    },
    [listData],
  );

  const handleEpModalMarkWatched = useCallback(async () => {
    if (!epModalData) return;
    const listItem = listData.find(
      (li) => li.type === "show" && li.item.tmdbId === epModalData.tmdbId,
    );
    if (!listItem || listItem.type !== "show") return;
    setEpModalMarking(true);
    try {
      await handleMarkWatched(listItem.item);
      setEpModalVisible(false);
      setEpModalData(null);
    } catch {}
    setEpModalMarking(false);
  }, [epModalData, listData, handleMarkWatched]);

  const handleEpModalShowPress = useCallback(() => {
    if (!epModalData) return;
    setEpModalVisible(false);
    setEpModalData(null);
    handleNavigateToShow(epModalData.tmdbId, MediaType.TV);
  }, [epModalData, handleNavigateToShow]);

  const handleTitlePress = useCallback(async (item: any) => {
    const cat = item.catalogShow;
    if (!cat) return;
    setDrawerShow({
      tmdbId: cat.tmdbId,
      title: cat.title,
      posterPath: cat.posterPath,
      backdropPath: cat.backdropPath,
      overview: cat.overview,
      mediaType: cat.mediaType,
      year:
        (cat.firstAirDate || cat.releaseDate || "")?.substring(0, 4) || null,
      totalSeasons: cat.totalSeasons,
      totalEpisodes: cat.totalEpisodes,
      runtime: cat.runtime,
      voteAverage: cat.voteAverage,
    });
    setDrawerVisible(true);

    // Fetch genres from TMDB
    const apiKey = useAuthStore.getState().appTmdbApiKey;
    if (apiKey) {
      try {
        const data = (await getShowDetails(
          apiKey,
          cat.tmdbId,
          cat.mediaType,
        )) as any;
        const genres = data?.genres?.map((g: any) => g.name).join(", ");
        if (genres) {
          setDrawerShow((prev) => (prev ? { ...prev, genres } : null));
        }
      } catch {}
    }
  }, []);

  const handleWatchedCheckmark = useCallback((episode: WatchedEpisode) => {
    setSheetEpisode(episode);
    setSheetVisible(true);
  }, []);

  const handleWatchedSwipeLeft = useCallback(
    async (episode: WatchedEpisode) => {
      if (!user?.uid) return;
      const catalog = await getCatalogShow(episode.tmdbShowId, MediaType.TV);
      const catalogSeason = catalog?.seasons?.find(
        (s) => s.seasonNumber === episode.season,
      );
      const catalogEp = catalogSeason?.episodes?.find(
        (e) => e.episodeNumber === episode.episode,
      );
      const nextEpInSeason = catalogSeason?.episodes?.find(
        (e) => e.episodeNumber === episode.episode + 1,
      );

      let nextEpisode: { season: number; episode: number } | null = null;
      let isComplete = false;

      if (nextEpInSeason) {
        nextEpisode = {
          season: episode.season,
          episode: nextEpInSeason.episodeNumber,
        };
      } else {
        const nextCatalogSeason = catalog?.seasons?.find(
          (s) => s.seasonNumber === episode.season + 1,
        );
        if (nextCatalogSeason && nextCatalogSeason.episodes.length > 0) {
          nextEpisode = { season: episode.season + 1, episode: 1 };
        } else {
          isComplete = true;
        }
      }

      await markEpisodeWatched(
        user.uid,
        episode.tmdbShowId,
        episode.season,
        episode.episode,
        catalogEp?.title || episode.episodeTitle,
        catalogEp?.runtime || episode.runtime,
        nextEpisode,
        isComplete,
      );
      const now = Timestamp.now();
      insertWatchedEpisodeCache(queryClient, user.uid, {
        id: `${episode.tmdbShowId}_S${String(episode.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`,
        tmdbShowId: episode.tmdbShowId,
        season: episode.season,
        episode: episode.episode,
        episodeTitle: catalogEp?.title || episode.episodeTitle,
        runtime: catalogEp?.runtime || episode.runtime,
        lastWatchedAt: now,
        watchedAt: now,
        watchCount: (episode.watchCount || 0) + 1,
      });
    },
    [user?.uid, queryClient],
  );

  const handleWatchedSwipeRight = useCallback(
    async (episode: WatchedEpisode) => {
      if (!user?.uid) return;
      if (episode.watchCount > 1) {
        await decrementEpisodeWatchCount(
          user.uid,
          episode.tmdbShowId,
          episode.season,
          episode.episode,
          episode.runtime,
          episode.watchCount,
          episode.episodeTitle,
        );
      } else {
        await unmarkEpisodeWatched(
          user.uid,
          episode.tmdbShowId,
          episode.season,
          episode.episode,
          episode.runtime,
          episode.episodeTitle,
        );
      }
      removeWatchedEpisodeCache(
        queryClient, user.uid,
        episode.tmdbShowId, episode.season, episode.episode,
        episode.watchCount > 1,
      );
    },
    [user?.uid, queryClient],
  );

  const handleSheetAction = useCallback(
    async (action: WatchAction) => {
      if (!user?.uid || !sheetEpisode) return;

      try {
        if (action === "rewatch") {
          const catalog = await getCatalogShow(sheetEpisode.tmdbShowId, MediaType.TV);
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
            sheetEpisode.episodeTitle,
          );
        } else if (action === "watched_once_less") {
          await decrementEpisodeWatchCount(
            user.uid,
            sheetEpisode.tmdbShowId,
            sheetEpisode.season,
            sheetEpisode.episode,
            sheetEpisode.runtime,
            sheetEpisode.watchCount,
            sheetEpisode.episodeTitle,
          );
        }
        if (action === "rewatch") {
          const now = Timestamp.now();
          insertWatchedEpisodeCache(queryClient, user.uid, {
            id: `${sheetEpisode.tmdbShowId}_S${String(sheetEpisode.season).padStart(2, "0")}E${String(sheetEpisode.episode).padStart(2, "0")}`,
            tmdbShowId: sheetEpisode.tmdbShowId,
            season: sheetEpisode.season,
            episode: sheetEpisode.episode,
            episodeTitle: sheetEpisode.episodeTitle,
            runtime: sheetEpisode.runtime,
            lastWatchedAt: now,
            watchedAt: now,
            watchCount: (sheetEpisode.watchCount || 0) + 1,
          });
        } else {
          removeWatchedEpisodeCache(
            queryClient, user.uid,
            sheetEpisode.tmdbShowId, sheetEpisode.season, sheetEpisode.episode,
            action === "watched_once_less",
          );
        }
      } catch (err: any) {
        console.error("Watch action failed:", err);
        Alert.alert("Error", err.message || "Action failed.");
      }

      setSheetEpisode(null);
    },
    [user?.uid, sheetEpisode, queryClient],
  );

  const handleTvPress = useCallback(
    (id: number) => handleNavigateToShow(id, MediaType.TV),
    [handleNavigateToShow],
  );

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "sectionHeader") {
        return <SectionHeader title={item.title} />;
      }

      if (item.type === "watchedMovie") {
        return (
          <ShowCard
            item={
              {
                ...item.show,
                nextEpisode: null,
                mediaType: MediaType.MOVIE,
                rewatchCount: Math.max(0, (item.movie.watchCount || 1) - 1),
              } as any
            }
            isWatched
            onSwipeLeft={NOOP_ASYNC}
            onSwipeRight={NOOP_ASYNC}
            onPress={(id) => handleNavigateToShow(id, MediaType.MOVIE)}
            onCheckmark={NOOP_CHECKMARK}
          />
        );
      }

      if (item.type === "watchedEpisode") {
        return (
          <WatchedEpisodeRow
            episode={item.episode}
            show={item.show}
            onPress={handleTvPress}
            onCheckmarkPress={handleWatchedCheckmark}
            onSwipeLeft={handleWatchedSwipeLeft}
            onSwipeRight={handleWatchedSwipeRight}
          />
        );
      }

      // All fields pre-computed in useWatchlistData — no catalog lookup needed
      return (
        <ShowCard
          item={item.item}
          isUpdating={updatingShows.has(item.item.tmdbId)}
          remainingEpisodes={(item.item as any).remaining ?? null}
          onSwipeLeft={handleMarkWatched}
          onSwipeRight={handleStopWatching}
          onPress={handleCardPress}
          onTitlePress={handleTitlePress}
          onCheckmark={handleMarkWatched}
        />
      );
    },
    [
      handleMarkWatched,
      handleStopWatching,
      handleCardPress,
      handleTitlePress,
      handleTvPress,
      watchedCountByShow,
      updatingShows,
      handleWatchedCheckmark,
      handleWatchedSwipeLeft,
      handleWatchedSwipeRight,
    ],
  );

  const contentStyle = useMemo(
    () => [
      styles.listContent,
      { minHeight: SCREEN_HEIGHT + prevWatchedOffset },
    ],
    [prevWatchedOffset],
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
      <LegendList
        ref={listRef}
        data={listData}
        keyExtractor={(item) => {
          if (item.type === "sectionHeader") return `section_${item.title}`;
          if (item.type === "watchedMovie") return `movie_${item.movie.id}`;
          if (item.type === "watchedEpisode")
            return `watched_${item.episode.id}`;
          return `show_${item.item.id}`;
        }}
        renderItem={renderItem}
        recycleItems
        drawDistance={SCREEN_HEIGHT * 2}
        estimatedItemSize={99}
        refreshControl={
          hasMorePrevWatched ? (
            <RefreshControl
              refreshing={loadingMorePrevWatched}
              onRefresh={loadMorePrevWatched}
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
        style={styles.list}
        contentContainerStyle={contentStyle}
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
      {epModalData && (
        <EpisodeDetailModal
          visible={epModalVisible}
          showTitle={epModalData.showTitle}
          season={epModalData.season}
          episode={epModalData.episode}
          episodeTitle={epModalData.episodeTitle}
          overview={epModalData.overview}
          stillPath={epModalData.stillPath}
          showPosterPath={epModalData.showPosterPath}
          airDate={epModalData.airDate}
          runtime={epModalData.runtime}
          loadingDetails={epModalLoading}
          markingWatched={epModalMarking}
          onMarkWatched={handleEpModalMarkWatched}
          onShowPress={handleEpModalShowPress}
          onClose={() => {
            setEpModalVisible(false);
            setEpModalData(null);
          }}
        />
      )}
      <ShowDrawer
        visible={drawerVisible}
        show={drawerShow}
        onGoToShow={
          drawerShow?.tmdbId
            ? () => {
                const id = drawerShow.tmdbId!;
                const mt =
                  drawerShow.mediaType === "movie"
                    ? MediaType.MOVIE
                    : MediaType.TV;
                setDrawerVisible(false);
                setDrawerShow(null);
                handleNavigateToShow(id, mt);
              }
            : undefined
        }
        onClose={() => {
          setDrawerVisible(false);
          setDrawerShow(null);
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
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
});
