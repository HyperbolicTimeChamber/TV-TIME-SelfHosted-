import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useRoute, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { useShowDetails } from "../hooks/useShowDetails";
import { useWatchlist } from "../hooks/useWatchlist";
import { useAuthStore } from "../stores/authStore";
import {
  addToWatchlist,
  removeFromWatchlist,
  startRewatch,
  resumeRewatch,
  markMovieWatched,
} from "../services/firestore";
import { colors, spacing, typography, posterSize } from "../theme";
import { HomeStackParamList, TMDBSeason } from "../types";

type RouteParams = RouteProp<HomeStackParamList, "ShowDetail">;
type NavProp = NativeStackNavigationProp<HomeStackParamList, "ShowDetail">;

export default function ShowDetailScreen() {
  const route = useRoute<RouteParams>();
  const navigation = useNavigation<NavProp>();
  const { tmdbId, mediaType } = route.params;
  const user = useAuthStore((s) => s.user);
  const { data: show, isLoading } = useShowDetails(tmdbId, mediaType);
  const { items: watchlist } = useWatchlist(user?.uid);

  const watchlistItem = useMemo(
    () => watchlist.find((w) => w.tmdbId === tmdbId),
    [watchlist, tmdbId]
  );

  const title = show?.name || show?.title || "";
  const year = (show?.first_air_date || show?.release_date || "").substring(
    0,
    4
  );

  const handleAddToWatchlist = useCallback(async () => {
    if (!user?.uid || !show) return;
    await addToWatchlist(
      user.uid,
      tmdbId,
      mediaType,
      title,
      show.poster_path || ""
    );
  }, [user?.uid, show, tmdbId, mediaType, title]);

  const handleRemove = useCallback(async () => {
    if (!user?.uid) return;
    await removeFromWatchlist(user.uid, tmdbId);
  }, [user?.uid, tmdbId]);

  const handleRewatch = useCallback(async () => {
    if (!user?.uid) return;
    if (watchlistItem?.status === "paused_rewatch") {
      await resumeRewatch(user.uid, tmdbId);
    } else {
      await startRewatch(user.uid, tmdbId);
    }
  }, [user?.uid, tmdbId, watchlistItem?.status]);

  const handleMarkMovieWatched = useCallback(async () => {
    if (!user?.uid || !show) return;
    if (!watchlistItem) {
      await addToWatchlist(user.uid, tmdbId, "movie", title, show.poster_path || "");
    }
    await markMovieWatched(user.uid, tmdbId, show.runtime ?? 0);
  }, [user?.uid, show, tmdbId, title, watchlistItem]);

  const handleSeasonPress = useCallback(
    (season: TMDBSeason) => {
      navigation.navigate("SeasonDetail", {
        tmdbId,
        seasonNumber: season.season_number,
        showTitle: title,
      });
    },
    [navigation, tmdbId, title]
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!show) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Failed to load show</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Image
        source={{ uri: `${posterSize.large}${show.backdrop_path || show.poster_path}` }}
        style={styles.backdrop}
        contentFit="cover"
      />

      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>
          {year}
          {show.number_of_seasons
            ? ` · ${show.number_of_seasons} Season${show.number_of_seasons > 1 ? "s" : ""}`
            : ""}
          {show.vote_average ? ` · ★ ${show.vote_average.toFixed(1)}` : ""}
        </Text>

        <View style={styles.actions}>
          {!watchlistItem ? (
            <>
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAddToWatchlist}
              >
                <Text style={styles.buttonText}>+ Add to Watchlist</Text>
              </TouchableOpacity>
              {mediaType === "movie" && (
                <TouchableOpacity
                  style={[styles.addButton, { backgroundColor: colors.watchedGreen }]}
                  onPress={handleMarkMovieWatched}
                >
                  <Text style={styles.buttonText}>Watched</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              {mediaType === "movie" && watchlistItem.status !== "completed" && (
                <TouchableOpacity
                  style={[styles.addButton, { backgroundColor: colors.watchedGreen }]}
                  onPress={handleMarkMovieWatched}
                >
                  <Text style={styles.buttonText}>Mark as Watched</Text>
                </TouchableOpacity>
              )}
              {mediaType === "movie" && watchlistItem.status === "completed" && (
                <View style={[styles.addButton, { backgroundColor: colors.watchedGreen, opacity: 0.7 }]}>
                  <Text style={styles.buttonText}>Watched ✓</Text>
                </View>
              )}
              {(watchlistItem.status === "completed" ||
                watchlistItem.status === "paused_rewatch") && (
                <TouchableOpacity
                  style={[styles.addButton, { backgroundColor: colors.accent }]}
                  onPress={handleRewatch}
                >
                  <Text style={styles.buttonText}>
                    {watchlistItem.status === "paused_rewatch"
                      ? "Resume Rewatch"
                      : "Rewatch"}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.addButton,
                  { backgroundColor: colors.destructiveRed },
                ]}
                onPress={handleRemove}
              >
                <Text style={styles.buttonText}>Remove</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <Text style={styles.overview}>{show.overview}</Text>

        {mediaType === "tv" && show.seasons && (
          <View style={styles.seasonsSection}>
            <Text style={styles.sectionTitle}>Seasons</Text>
            {show.seasons
              .filter((s) => s.season_number > 0)
              .map((season) => (
                <TouchableOpacity
                  key={season.id}
                  style={styles.seasonRow}
                  onPress={() => handleSeasonPress(season)}
                >
                  <Image
                    source={{
                      uri: `${posterSize.small}${season.poster_path || show.poster_path}`,
                    }}
                    style={styles.seasonPoster}
                    contentFit="cover"
                  />
                  <View style={styles.seasonInfo}>
                    <Text style={styles.seasonName}>{season.name}</Text>
                    <Text style={styles.seasonMeta}>
                      {season.episode_count} episodes
                      {season.air_date
                        ? ` · ${season.air_date.substring(0, 4)}`
                        : ""}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  backdrop: {
    width: "100%",
    height: 220,
  },
  content: {
    padding: spacing.lg,
  },
  title: {
    ...typography.title,
    fontSize: 24,
  },
  meta: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  addButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonText: {
    ...typography.subtitle,
    fontSize: 14,
    color: colors.text,
  },
  overview: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    lineHeight: 22,
  },
  seasonsSection: {
    marginTop: spacing.xl,
  },
  sectionTitle: {
    ...typography.title,
    fontSize: 18,
    marginBottom: spacing.md,
  },
  seasonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  seasonPoster: {
    width: 45,
    height: 67,
    borderRadius: 4,
  },
  seasonInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  seasonName: {
    ...typography.subtitle,
    fontSize: 14,
  },
  seasonMeta: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  chevron: {
    ...typography.title,
    color: colors.textMuted,
  },
});
