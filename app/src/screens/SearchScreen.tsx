import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { AnimatedModal, ConfirmModal, LoadingSpinner } from "../components";
import { LegendList } from "@legendapp/list/react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSearch, useTrending, useTrackedIds } from "../hooks";
import { useAuthStore } from "../stores";
import { addToTracking, removeFromTracking, markMovieWatched } from "../services";
import { colors, spacing, typography, posterSize } from "../theme";
import { TMDBShow, SearchStackParamList, MediaType, Route } from "../types";

type NavProp = NativeStackNavigationProp<SearchStackParamList, Route.SEARCH_MAIN>;

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 100);
    return () => clearTimeout(timer);
  }, [query]);
  const navigation = useNavigation<NavProp>();
  const user = useAuthStore((s) => s.user);
  const trackedIds = useTrackedIds(user?.uid);

  const [addingIds, setAddingIds] = useState<Set<number>>(new Set());
  const [movieModal, setMovieModal] = useState<TMDBShow | null>(null);
  const [removeModal, setRemoveModal] = useState<TMDBShow | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const watchlistIds = trackedIds;

  const withLoadingId = useCallback(
    async (id: number, fn: () => Promise<void>) => {
      setAddingIds((prev) => new Set(prev).add(id));
      try {
        await fn();
      } catch (err: any) {
        Alert.alert("Error", err.message || "Failed to complete action.");
      } finally {
        setAddingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    []
  );

  const handleAddToWatchlist = useCallback(
    async (item: TMDBShow) => {
      if (!user?.uid) return;
      const mediaType: MediaType =
        item.media_type || (item.title ? MediaType.MOVIE : MediaType.TV);

      if (mediaType === MediaType.MOVIE) {
        setMovieModal(item);
        return;
      }

      await withLoadingId(item.id, () =>
        addToTracking(user.uid!, item.id, mediaType)
      );
    },
    [user?.uid, withLoadingId]
  );

  const handleRemoveFromWatchlist = useCallback(
    (item: TMDBShow) => {
      if (!user?.uid) return;
      setRemoveError(null);
      setRemoveModal(item);
    },
    [user?.uid]
  );

  const handleConfirmRemove = useCallback(async () => {
    if (!user?.uid || !removeModal || removing) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await removeFromTracking(user.uid, removeModal.id);
      setRemoveModal(null);
    } catch (err: any) {
      console.error("removeFromTracking failed:", err);
      setRemoveError(err.message || "Failed to remove. Please try again.");
    } finally {
      setRemoving(false);
    }
  }, [user?.uid, removeModal, removing]);

  const handleMovieAddOnly = useCallback(async () => {
    if (!user?.uid || !movieModal) return;
    const item = movieModal;
    setMovieModal(null);
    await withLoadingId(item.id, () =>
      addToTracking(user.uid!, item.id, "movie")
    );
  }, [user?.uid, movieModal, withLoadingId]);

  const handleMovieAddAndWatch = useCallback(async () => {
    if (!user?.uid || !movieModal) return;
    const item = movieModal;
    setMovieModal(null);
    await withLoadingId(item.id, async () => {
      await addToTracking(user.uid!, item.id, "movie");
      await markMovieWatched(user.uid!, item.id, (item as any).runtime ?? 0);
    });
  }, [user?.uid, movieModal, withLoadingId]);

  const {
    data: searchData,
    isLoading: searchLoading,
    fetchNextPage,
    hasNextPage,
  } = useSearch(debouncedQuery);

  const { data: trending, isLoading: trendingLoading } = useTrending(MediaType.TV);

  const displayData = debouncedQuery.length > 0 ? searchData?.results : trending;
  const isLoading = debouncedQuery.length > 0 ? searchLoading : trendingLoading;

  const handlePress = useCallback(
    (item: TMDBShow) => {
      const mediaType: MediaType =
        item.media_type || (item.title ? MediaType.MOVIE : MediaType.TV);
      navigation.navigate(Route.SHOW_DETAIL, {
        tmdbId: item.id,
        mediaType,
      });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: TMDBShow }) => {
      const title = item.name || item.title || "";
      const year = (item.first_air_date || item.release_date || "").substring(
        0,
        4
      );
      const mediaType: MediaType =
        item.media_type || (item.title ? MediaType.MOVIE : MediaType.TV);
      const isInWatchlist = watchlistIds.has(item.id);
      const isAdding = addingIds.has(item.id);

      return (
        <TouchableOpacity
          style={styles.card}
          onPress={() => handlePress(item)}
          activeOpacity={0.7}
        >
          <Image
            source={{ uri: `${posterSize.medium}${item.poster_path}` }}
            style={styles.poster}
            contentFit="cover"
          />
          <TouchableOpacity
            style={[
              styles.watchlistBadge,
              isInWatchlist && styles.watchlistBadgeActive,
            ]}
            onPress={(e) => {
              e.stopPropagation?.();
              if (isAdding) return;
              if (isInWatchlist) {
                handleRemoveFromWatchlist(item);
              } else {
                handleAddToWatchlist(item);
              }
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
            disabled={isAdding}
          >
            {isAdding ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Text
                style={[
                  styles.watchlistBadgeText,
                  isInWatchlist && styles.watchlistBadgeTextActive,
                ]}
              >
                {isInWatchlist ? "✓" : "+"}
              </Text>
            )}
          </TouchableOpacity>
          <View style={styles.banner}>
            <View style={styles.bannerTop}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {title}
              </Text>
              <View
                style={[
                  styles.typeBadge,
                  mediaType === MediaType.MOVIE && styles.typeBadgeMovie,
                ]}
              >
                <Text style={styles.typeBadgeText}>
                  {mediaType === MediaType.TV ? "TV" : "MOVIE"}
                </Text>
              </View>
            </View>
            {year ? <Text style={styles.cardYear}>{year}</Text> : null}
          </View>
        </TouchableOpacity>
      );
    },
    [handlePress, watchlistIds, handleAddToWatchlist, handleRemoveFromWatchlist, addingIds]
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          placeholder="Search shows & movies..."
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.clearButtonText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {!query && (
        <Text style={styles.sectionTitle}>Trending</Text>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <LoadingSpinner />
        </View>
      ) : (
        <LegendList
          data={displayData || []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          extraData={[watchlistIds, addingIds]}
          numColumns={3}
          estimatedItemSize={200}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          onEndReached={() => {
            if (debouncedQuery && hasNextPage) fetchNextPage();
          }}
          onEndReachedThreshold={0.5}
          recycleItems={false}
        />
      )}

      <AnimatedModal
        visible={!!movieModal}
        onClose={() => setMovieModal(null)}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {movieModal?.title || movieModal?.name}
          </Text>
          <TouchableOpacity
            style={styles.modalButton}
            onPress={handleMovieAddOnly}
          >
            <Text style={styles.modalButtonText}>Add to Watchlist</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, styles.modalButtonWatched]}
            onPress={handleMovieAddAndWatch}
          >
            <Text style={styles.modalButtonText}>Add & Mark as Watched</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.modalCancel}
            onPress={() => setMovieModal(null)}
          >
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </AnimatedModal>

      <ConfirmModal
        visible={!!removeModal}
        title={`Remove "${removeModal?.name || removeModal?.title}"?`}
        hint="This will remove the show from your watchlist. Your watch history will be kept."
        error={removeError}
        confirmLabel="Remove"
        loading={removing}
        onConfirm={handleConfirmRemove}
        onClose={() => {
          setRemoveModal(null);
          setRemoveError(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceLight,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    borderRadius: 8,
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  clearButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  clearButtonText: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: "600",
  },
  sectionTitle: {
    ...typography.subtitle,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  grid: {
    paddingHorizontal: spacing.xs,
  },
  row: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
  },
  card: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 6,
  },
  poster: {
    aspectRatio: 2 / 3,
    borderRadius: 6,
    backgroundColor: colors.surface,
    width: "100%",
  },
  banner: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.overlayLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  cardTitle: {
    ...typography.caption,
    color: colors.text,
    flexShrink: 1,
  },
  cardYear: {
    ...typography.caption,
    fontSize: 11,
  },
  watchlistBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.text,
    backgroundColor: colors.badgeOverlay,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  watchlistBadgeActive: {
    backgroundColor: colors.watchedGreen,
    borderColor: colors.watchedGreen,
  },
  watchlistBadgeText: {
    fontSize: 16,
    fontWeight: "700" as const,
    color: colors.text,
    lineHeight: 18,
  },
  watchlistBadgeTextActive: {
    fontSize: 14,
  },
  bannerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  typeBadge: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },
  typeBadgeMovie: {
    backgroundColor: colors.moviePurple,
  },
  typeBadgeText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: "700",
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
  },
  modalTitle: {
    ...typography.subtitle,
    fontSize: 16,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  modalButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  modalButtonWatched: {
    backgroundColor: colors.watchedGreen,
  },
  modalButtonText: {
    ...typography.subtitle,
    fontSize: 14,
    color: colors.text,
  },
  modalCancel: {
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  modalCancelText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
