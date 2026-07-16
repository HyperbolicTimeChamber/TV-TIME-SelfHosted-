import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import LoadingSpinner from "../components/LoadingSpinner";
import { useRoute } from "@react-navigation/native";
import { RouteProp } from "@react-navigation/native";
import {
  getFirestore,
  doc,
  onSnapshot,
} from "@react-native-firebase/firestore";
import { useShowDetails } from "../hooks";
import { useAuthStore } from "../stores/authStore";
import {
  addToTracking,
  removeFromTracking,
  startRewatch,
  resumeRewatch,
  markMovieWatched,
} from "../services/firestore";
import SeasonDropdown from "../components/SeasonDropdown";
import { colors, spacing, typography, posterSize } from "../theme";
import { HomeStackParamList } from "../types";

type RouteParams = RouteProp<HomeStackParamList, "ShowDetail">;

export default function ShowDetailScreen() {
  const route = useRoute<RouteParams>();
  const { tmdbId, mediaType } = route.params;
  const user = useAuthStore((s) => s.user);
  const { data: show, isLoading } = useShowDetails(tmdbId, mediaType);
  const [watchlistItem, setWatchlistItem] = useState<any>(null);
  const [trackingLoading, setTrackingLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setTrackingLoading(false);
      return;
    }
    const db = getFirestore();
    const trackingDoc = doc(db, "users", user.uid, "tracking", String(tmdbId));
    const unsubscribe = onSnapshot(trackingDoc, (snap) => {
      setWatchlistItem(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setTrackingLoading(false);
    });
    return unsubscribe;
  }, [user?.uid, tmdbId]);

  const title = show?.name || show?.title || "";
  const year = (show?.first_air_date || show?.release_date || "").substring(
    0,
    4
  );

  const handleAddToWatchlist = useCallback(async () => {
    if (!user?.uid || !show || adding) return;
    setAdding(true);
    try {
      await addToTracking(user.uid, tmdbId, mediaType);
    } catch (err: any) {
      console.error("addToTracking failed:", err);
      Alert.alert("Error", err.message || "Failed to add to watchlist.");
    } finally {
      setAdding(false);
    }
  }, [user?.uid, show, tmdbId, mediaType, adding]);

  const handleRemove = useCallback(async () => {
    if (!user?.uid) return;
    await removeFromTracking(user.uid, tmdbId);
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
    if (!user?.uid || !show || adding) return;
    setAdding(true);
    try {
      if (!watchlistItem) {
        await addToTracking(user.uid, tmdbId, "movie");
      }
      await markMovieWatched(user.uid, tmdbId, show.runtime ?? 0);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to mark movie as watched.");
    } finally {
      setAdding(false);
    }
  }, [user?.uid, show, tmdbId, watchlistItem, adding]);


  if (isLoading || trackingLoading) {
    return (
      <View style={styles.center}>
        <LoadingSpinner />
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
                style={[styles.addButton, adding && { opacity: 0.6 }]}
                onPress={handleAddToWatchlist}
                disabled={adding}
              >
                {adding ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Text style={styles.buttonText}>+ Add to Watchlist</Text>
                )}
              </TouchableOpacity>
              {mediaType === "movie" && (
                <TouchableOpacity
                  style={[styles.addButton, { backgroundColor: colors.watchedGreen }, adding && { opacity: 0.6 }]}
                  onPress={handleMarkMovieWatched}
                  disabled={adding}
                >
                  {adding ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <Text style={styles.buttonText}>Watched</Text>
                  )}
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              {mediaType === "movie" && watchlistItem.status !== "completed" && (
                <TouchableOpacity
                  style={[styles.addButton, { backgroundColor: colors.watchedGreen }, adding && { opacity: 0.6 }]}
                  onPress={handleMarkMovieWatched}
                  disabled={adding}
                >
                  {adding ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <Text style={styles.buttonText}>Mark as Watched</Text>
                  )}
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
                <SeasonDropdown
                  key={season.season_number}
                  tmdbId={tmdbId}
                  season={season}
                  showPosterPath={show.poster_path}
                />
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
});
