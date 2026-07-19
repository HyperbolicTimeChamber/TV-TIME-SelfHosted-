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
import { useFocusEffect } from "@react-navigation/native";
import {
  AnimatedModal,
  ConfirmModal,
  LoadingSpinner,
  UnreleasedMovieModal,
  shouldShowUnreleasedModal,
} from "../components";
import { LegendList } from "@legendapp/list/react-native";
import { Image } from "expo-image";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  useSearch,
  useTrending,
  useTrackedIds,
  useUpcomingMutations,
} from "../hooks";
import {
  getFirestore,
  doc,
  updateDoc,
} from "@react-native-firebase/firestore";
import { useAuthStore } from "../stores";
import {
  addToTracking,
  removeFromTracking,
  markMovieWatched,
  getHighestWatchedEpisode,
  getCatalogShow,
} from "../services";
import { colors, spacing, typography, posterSize } from "../theme";
import { TMDBShow, SearchStackParamList, MediaType, Route } from "../types";

type NavProp = NativeStackNavigationProp<
  SearchStackParamList,
  Route.SEARCH_MAIN
>;

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "tv" | "movie">("all");
  const [typingLoading, setTypingLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (query.length > 0) setTypingLoading(true);
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setTypingLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Clear search when leaving the tab
  useFocusEffect(
    useCallback(() => {
      return () => {
        setQuery("");
        setDebouncedQuery("");
        setMediaFilter("all");
      };
    }, []),
  );
  const navigation = useNavigation<NavProp>();
  const user = useAuthStore((s) => s.user);
  const trackedIds = useTrackedIds(user?.uid);

  const [addingIds, setAddingIds] = useState<Set<number>>(new Set());
  const [movieModal, setMovieModal] = useState<TMDBShow | null>(null);
  const [removeModal, setRemoveModal] = useState<TMDBShow | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [unreleasedModal, setUnreleasedModal] = useState<{
    title: string;
  } | null>(null);
  const [resumeModal, setResumeModal] = useState<{
    item: TMDBShow;
    highestEp: { season: number; episode: number };
    nextEp: { season: number; episode: number };
    nextEpName: string | null;
    nextEpAirDate: string | null;
  } | null>(null);
  const { addShowToUpcoming, removeShowFromUpcoming } = useUpcomingMutations();

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
    [],
  );

  const handleAddToWatchlist = useCallback(
    async (item: TMDBShow) => {
      if (!user?.uid) return;
      const mediaType: MediaType =
        item.media_type || (item.title ? MediaType.MOVIE : MediaType.TV);

      if (mediaType === MediaType.MOVIE) {
        const releaseDate = item.release_date || null;
        const today = new Date().toISOString().split("T")[0];
        const isUnreleased = releaseDate && releaseDate > today;

        if (isUnreleased) {
          // Run modal check and add in parallel
          const addPromise = withLoadingId(item.id, () =>
            addToTracking(user.uid!, item.id, MediaType.MOVIE, releaseDate),
          );
          shouldShowUnreleasedModal(user.uid!).then((shouldShow) => {
            if (shouldShow) {
              setUnreleasedModal({ title: item.title || item.name || "" });
            }
          });
          await addPromise;
          return;
        }

        // Released movie — show add/add+watch modal
        setMovieModal(item);
        return;
      }

      // Check for existing watch history (re-add case)
      const highestEp = await getHighestWatchedEpisode(user.uid!, item.id);
      if (highestEp) {
        // Show resume modal
        const catalog = await getCatalogShow(item.id);
        let nextEp: { season: number; episode: number } = { season: highestEp.season, episode: highestEp.episode + 1 };
        let nextEpName: string | null = null;
        let nextEpAirDate: string | null = null;
        if (catalog) {
          const catalogSeason = catalog.seasons?.find((s) => s.seasonNumber === highestEp.season);
          const nextInSeason = catalogSeason?.episodes?.find((e) => e.episodeNumber === highestEp.episode + 1);
          if (nextInSeason) {
            nextEpName = nextInSeason.title || null;
            nextEpAirDate = nextInSeason.airDate || null;
          } else {
            const nextCatalogSeason = catalog.seasons?.find((s) => s.seasonNumber === highestEp.season + 1);
            if (nextCatalogSeason && nextCatalogSeason.episodes.length > 0) {
              nextEp = { season: highestEp.season + 1, episode: 1 };
              nextEpName = nextCatalogSeason.episodes[0].title || null;
              nextEpAirDate = nextCatalogSeason.episodes[0].airDate || null;
            }
          }
        }
        setResumeModal({ item, highestEp, nextEp, nextEpName, nextEpAirDate });
        return;
      }

      await withLoadingId(item.id, async () => {
        await addToTracking(user.uid!, item.id, mediaType);
        addShowToUpcoming(item.id);
      });
    },
    [user?.uid, withLoadingId, addShowToUpcoming],
  );

  const handleRemoveFromWatchlist = useCallback(
    (item: TMDBShow) => {
      if (!user?.uid) return;
      setRemoveError(null);
      setRemoveModal(item);
    },
    [user?.uid],
  );

  const handleConfirmRemove = useCallback(async () => {
    if (!user?.uid || !removeModal || removing) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await removeFromTracking(user.uid, removeModal.id);
      removeShowFromUpcoming(removeModal.id);
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
      addToTracking(user.uid!, item.id, MediaType.MOVIE),
    );
  }, [user?.uid, movieModal, withLoadingId]);

  const handleMovieAddAndWatch = useCallback(async () => {
    if (!user?.uid || !movieModal) return;
    const item = movieModal;
    setMovieModal(null);
    await withLoadingId(item.id, async () => {
      await addToTracking(user.uid!, item.id, MediaType.MOVIE);
      await markMovieWatched(user.uid!, item.id, (item as any).runtime ?? 0);
    });
  }, [user?.uid, movieModal, withLoadingId]);

  const handleResumeFromWhere = useCallback(async () => {
    if (!user?.uid || !resumeModal) return;
    const { item, nextEp, nextEpName, nextEpAirDate } = resumeModal;
    setResumeModal(null);
    await withLoadingId(item.id, async () => {
      await addToTracking(user.uid!, item.id, MediaType.TV);
      // Update tracking doc to resume position
      const db = getFirestore();
      await updateDoc(doc(db, "users", user.uid!, "tracking", String(item.id)), {
        nextEpisode: nextEp,
        nextEpisodeName: nextEpName,
        nextEpisodeAirDate: nextEpAirDate,
      });
      addShowToUpcoming(item.id);
    });
  }, [user?.uid, resumeModal, withLoadingId, addShowToUpcoming]);

  const handleStartFresh = useCallback(async () => {
    if (!user?.uid || !resumeModal) return;
    const item = resumeModal.item;
    setResumeModal(null);
    await withLoadingId(item.id, async () => {
      await addToTracking(user.uid!, item.id, MediaType.TV);
      addShowToUpcoming(item.id);
    });
  }, [user?.uid, resumeModal, withLoadingId, addShowToUpcoming]);

  const {
    data: searchData,
    isLoading: searchLoading,
    fetchNextPage,
    hasNextPage,
  } = useSearch(debouncedQuery, mediaFilter);

  const { data: trending, isLoading: trendingLoading } = useTrending("all");

  const filteredTrending = trending?.filter((item) => {
    if (mediaFilter === "all") return true;
    const mt = item.media_type || (item.title ? "movie" : "tv");
    return mt === mediaFilter;
  });

  const displayData =
    debouncedQuery.length > 0 ? searchData?.results : filteredTrending;
  const isLoading =
    typingLoading || (debouncedQuery.length > 0 ? searchLoading : trendingLoading);

  const handlePress = useCallback(
    (item: TMDBShow) => {
      const mediaType: MediaType =
        item.media_type || (item.title ? MediaType.MOVIE : MediaType.TV);
      navigation.navigate(Route.SHOW_DETAIL, {
        tmdbId: item.id,
        mediaType,
      });
    },
    [navigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: TMDBShow }) => {
      const title = item.name || item.title || "";
      const year = (item.first_air_date || item.release_date || "").substring(
        0,
        4,
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
    [
      handlePress,
      watchlistIds,
      handleAddToWatchlist,
      handleRemoveFromWatchlist,
      addingIds,
    ],
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

      <View style={styles.filterRow}>
        {(["all", "tv", "movie"] as const).map((type) => (
          <TouchableOpacity
            key={type}
            style={[
              styles.filterTab,
              mediaFilter === type && styles.filterTabActive,
            ]}
            onPress={() => setMediaFilter(type)}
          >
            <Text
              style={[
                styles.filterTabText,
                mediaFilter === type && styles.filterTabTextActive,
              ]}
            >
              {type === "all" ? "All" : type === "tv" ? "TV" : "Movies"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!query && <Text style={styles.sectionTitle}>Trending</Text>}

      {isLoading ? (
        <View style={styles.center}>
          <LoadingSpinner />
        </View>
      ) : !isLoading && debouncedQuery.length > 0 && (!displayData || displayData.length === 0) ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No results found</Text>
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

      <AnimatedModal visible={!!movieModal} onClose={() => setMovieModal(null)}>
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
        hint="This will remove it from your watchlist. Your watch history will be kept."
        error={removeError}
        confirmLabel="Remove"
        loading={removing}
        onConfirm={handleConfirmRemove}
        onClose={() => {
          setRemoveModal(null);
          setRemoveError(null);
        }}
      />

      <UnreleasedMovieModal
        visible={!!unreleasedModal}
        onClose={() => setUnreleasedModal(null)}
        movieTitle={unreleasedModal?.title ?? ""}
      />

      <AnimatedModal visible={!!resumeModal} onClose={() => setResumeModal(null)}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {resumeModal?.item?.name || resumeModal?.item?.title}
          </Text>
          <Text style={[styles.modalCancelText, { marginBottom: spacing.lg, textAlign: "center" }]}>
            You've previously watched up to S{String(resumeModal?.highestEp?.season).padStart(2, "0")}E{String(resumeModal?.highestEp?.episode).padStart(2, "0")}
          </Text>
          <TouchableOpacity
            style={styles.modalButton}
            onPress={handleResumeFromWhere}
          >
            <Text style={styles.modalButtonText}>
              Resume from S{String(resumeModal?.nextEp?.season).padStart(2, "0")}E{String(resumeModal?.nextEp?.episode).padStart(2, "0")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, { backgroundColor: colors.surfaceLight }]}
            onPress={handleStartFresh}
          >
            <Text style={styles.modalButtonText}>Start from Beginning</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.modalCancel}
            onPress={() => setResumeModal(null)}
          >
            <Text style={styles.modalCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </AnimatedModal>
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
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  filterTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
  },
  filterTabText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  filterTabTextActive: {
    color: colors.text,
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
  emptyText: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
});
