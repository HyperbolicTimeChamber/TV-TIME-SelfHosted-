import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { LegendList } from "@legendapp/list/react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  LoadingSpinner,
  EpisodeDetailModal,
  ShowDrawer,
} from "../../../components";
import type { ShowDrawerData } from "../../../components/ShowDrawer";
import { useAuthStore } from "../../../stores";
import { useUpcomingEpisodes } from "../../../hooks";
import {
  getCatalogShow,
  getShowDetails,
  getSeasonDetails,
} from "../../../services";
import { colors, spacing, typography } from "../../../theme";
import {
  UpcomingEpisode,
  HomeStackParamList,
  Route,
  MediaType,
} from "../../../types";
import DateHeader from "./DateHeader";
import UpcomingEpisodeRow from "./UpcomingEpisodeRow";

const SCREEN_HEIGHT = Dimensions.get("window").height;

type NavProp = NativeStackNavigationProp<HomeStackParamList, Route.HOME_TABS>;

type ListItem =
  | { type: "header"; date: string }
  | { type: "episode"; episode: UpcomingEpisode };

export default function UpcomingTab() {
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation<NavProp>();
  const {
    data: episodes,
    isLoading,
    error,
    retry,
  } = useUpcomingEpisodes(user?.uid);

  // Episode detail modal
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
    showPosterPath: string | null;
  } | null>(null);
  const [epModalLoading, setEpModalLoading] = useState(false);

  // Show drawer
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerShow, setDrawerShow] = useState<ShowDrawerData | null>(null);

  const listData = useMemo(() => {
    if (!episodes || episodes.length === 0) return [] as ListItem[];

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

  const handleNavigateToShow = useCallback(
    (tmdbShowId: number) => {
      navigation.navigate(Route.SHOW_DETAIL, {
        tmdbId: tmdbShowId,
        mediaType: MediaType.TV,
      });
    },
    [navigation],
  );

  const handleEpisodePress = useCallback(async (ep: UpcomingEpisode) => {
    setEpModalData({
      showTitle: ep.showTitle,
      season: ep.season,
      episode: ep.episode,
      episodeTitle: ep.episodeTitle,
      overview: null,
      stillPath: null,
      airDate: ep.airDate,
      runtime: ep.runtime,
      showPosterPath: ep.posterPath ?? null,
    });
    setEpModalLoading(true);
    setEpModalVisible(true);

    const apiKey = useAuthStore.getState().appTmdbApiKey;
    if (apiKey) {
      try {
        const seasonData = await getSeasonDetails(
          apiKey,
          ep.tmdbShowId,
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
                }
              : null,
          );
        }
      } catch {}
    }
    setEpModalLoading(false);
  }, []);

  const handleTitlePress = useCallback(async (ep: UpcomingEpisode) => {
    const catalog = await getCatalogShow(
      ep.tmdbShowId,
      ep.mediaType === MediaType.MOVIE ? "movie" : "tv",
    );
    if (catalog) {
      setDrawerShow({
        tmdbId: catalog.tmdbId,
        title: catalog.title,
        posterPath: catalog.posterPath,
        backdropPath: catalog.backdropPath,
        overview: catalog.overview,
        mediaType: catalog.mediaType,
        year: (catalog.firstAirDate || "")?.substring(0, 4) || null,
        totalSeasons: catalog.totalSeasons,
        totalEpisodes: catalog.totalEpisodes,
        runtime: catalog.runtime,
        voteAverage: catalog.voteAverage,
      });
      setDrawerVisible(true);

      const apiKey = useAuthStore.getState().appTmdbApiKey;
      if (apiKey) {
        try {
          const data = (await getShowDetails(
            apiKey,
            catalog.tmdbId,
            catalog.mediaType,
          )) as any;
          const genres = data?.genres?.map((g: any) => g.name).join(", ");
          if (genres) {
            setDrawerShow((prev) => (prev ? { ...prev, genres } : null));
          }
        } catch {}
      }
    }
  }, []);

  const handleEpModalShowPress = useCallback(() => {
    if (!epModalData) return;
    const ep = episodes?.find(
      (e) =>
        e.season === epModalData.season && e.episode === epModalData.episode,
    );
    setEpModalVisible(false);
    setEpModalData(null);
    if (ep) handleNavigateToShow(ep.tmdbShowId);
  }, [epModalData, episodes, handleNavigateToShow]);

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "header") {
        return <DateHeader date={item.date} />;
      }
      return (
        <UpcomingEpisodeRow
          episode={item.episode}
          onPress={handleNavigateToShow}
          onTitlePress={handleTitlePress}
          onEpisodePress={handleEpisodePress}
        />
      );
    },
    [handleNavigateToShow, handleTitlePress, handleEpisodePress],
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <LoadingSpinner />
        <Text style={styles.loadingText}>Predicting Your Future...</Text>
        <Text style={styles.loadingHint}>This may take a moment</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={retry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
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
    <>
      <LegendList
        data={listData}
        keyExtractor={(item) =>
          item.type === "header"
            ? `header_${item.date}`
            : `ep_${item.episode.tmdbShowId}_S${item.episode.season}E${item.episode.episode}`
        }
        renderItem={renderItem}
        recycleItems
        drawDistance={SCREEN_HEIGHT * 2}
        estimatedItemSize={72}
        style={styles.list}
        contentContainerStyle={styles.listContent}
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
                setDrawerVisible(false);
                setDrawerShow(null);
                handleNavigateToShow(id);
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
    paddingBottom: spacing.xl,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    ...typography.subtitle,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
  loadingHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  empty: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
  errorText: {
    ...typography.subtitle,
    color: colors.destructiveRed,
  },
  retryButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 8,
  },
  retryText: {
    ...typography.subtitle,
    fontSize: 14,
    color: colors.text,
  },
});
