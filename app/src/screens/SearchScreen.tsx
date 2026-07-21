import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
  removeShowFromCalendarGlobal,
  addMovieToCalendarGlobal,
} from "../hooks";
import {
  getFirestore,
  doc,
  updateDoc,
  Timestamp,
} from "@react-native-firebase/firestore";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../stores";
import {
  addToTracking,
  removeFromTracking,
  markMovieWatched,
  addAndMarkMovieWatched,
  getHighestWatchedEpisode,
  getSeasonDetails,
} from "../services";
import { colors, spacing, typography, posterSize } from "../theme";
import { showDocId } from "../utils/docId";
import { warmupSearchCFs } from "../services/warmup";
import { emitShowAdded, emitShowRemoved } from "../utils/watchlistEvents";
import type { EnrichedTrackingItem } from "../hooks/useWatchlist";
import { getCachedCatalogShow } from "../hooks/useWatchlist";
import {
  TMDBShow,
  SearchStackParamList,
  MediaType,
  Route,
  QueryKey,
  WatchedMovie,
  WatchStatus,
  UpcomingEpisode,
  CatalogShow,
} from "../types";

type NavProp = NativeStackNavigationProp<
  SearchStackParamList,
  Route.SEARCH_MAIN
>;

interface EpInfo {
  name: string | null;
  airDate: string | null;
  runtime: number | null;
  catalog: CatalogShow | null;
  /** All TMDB episodes from season 1 (when no catalog) */
  tmdbEpisodes: Array<{ season: number; episode: number; name: string; airDate: string | null; runtime: number | null }>;
}

/** Fetch episode info from local catalog cache or TMDB. 0 Firestore reads. */
async function fetchFirstEpisodeInfo(
  tmdbId: number,
  apiKey: string | null,
): Promise<EpInfo> {
  // Try shared catalog cache first (0 Firestore reads)
  const cached = getCachedCatalogShow(tmdbId, MediaType.TV);
  if (cached?.seasons?.length) {
    const s1 = cached.seasons.find((s) => s.seasonNumber === 1);
    const ep1 = s1?.episodes?.find((e) => e.episodeNumber === 1);
    if (ep1) {
      return {
        name: ep1.title || null,
        airDate: ep1.airDate || null,
        runtime: ep1.runtime || null,
        catalog: cached,
        tmdbEpisodes: [],
      };
    }
  }

  // Fallback: TMDB season 1 — return ALL episodes (0 Firestore reads)
  if (apiKey) {
    try {
      const season = await getSeasonDetails(apiKey, tmdbId, 1);
      const eps = season?.episodes ?? [];
      const ep1 = eps.find((e) => e.episode_number === 1);
      return {
        name: ep1?.name || null,
        airDate: ep1?.air_date || null,
        runtime: ep1?.runtime || null,
        catalog: null,
        tmdbEpisodes: eps.map((e) => ({
          season: 1,
          episode: e.episode_number,
          name: e.name || "",
          airDate: e.air_date || null,
          runtime: e.runtime ?? null,
        })),
      };
    } catch {}
  }

  return { name: null, airDate: null, runtime: null, catalog: null, tmdbEpisodes: [] };
}

/** Build an EnrichedTrackingItem for optimistic watchlist insert */
function buildOptimisticItem(
  tmdbId: number,
  mediaType: MediaType,
  title: string,
  posterPath: string | null,
  nextEpisode: { season: number; episode: number } | null,
  nextEpisodeName: string | null,
  nextEpisodeAirDate: string | null,
  catalog: CatalogShow | null,
  releaseDate?: string | null,
): EnrichedTrackingItem {
  const now = Timestamp.now();
  return {
    id: showDocId(tmdbId, mediaType),
    tmdbId,
    mediaType,
    status: WatchStatus.WATCHING,
    nextEpisode,
    nextEpisodeName,
    nextEpisodeAirDate,
    rewatchCount: 0,
    addedAt: now,
    lastWatchedAt: now,
    priorityDate: now,
    releaseDate: releaseDate ?? null,
    title,
    posterPath,
    totalEpisodes: catalog?.totalEpisodes ?? 0,
    catalogShow: catalog,
  };
}

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "tv" | "movie">("all");
  const inputRef = useRef<TextInput>(null);
  const [inputFocused, setInputFocused] = useState(false);

  // Search history — persisted, 10KB byte limit (~530 terms), no duplicates, FIFO eviction
  const HISTORY_KEY = "search_history";
  const MAX_BYTES = 10240;
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then((raw) => {
      if (raw) setSearchHistory(JSON.parse(raw));
    });
  }, []);

  const addToHistory = useCallback((term: string) => {
    const trimmed = term.trim().toLowerCase();
    if (!trimmed || trimmed.length < 2) return;
    setSearchHistory((prev) => {
      // Remove duplicate (case-insensitive)
      const filtered = prev.filter((h) => h.toLowerCase() !== trimmed);
      let next = [trimmed, ...filtered];
      // Evict oldest until under byte limit
      while (JSON.stringify(next).length > MAX_BYTES && next.length > 1) {
        next.pop();
      }
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // Suggestions: current query as top item + matching history
  const suggestions = useMemo(() => {
    if (!query || query.length < 1) return [];
    const lower = query.toLowerCase();
    const history = searchHistory
      .filter((h) => h.toLowerCase().includes(lower) && h.toLowerCase() !== lower)
      .slice(0, 7);
    return [query, ...history];
  }, [query, searchHistory]);

  const submitSearch = useCallback((term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setSubmittedQuery(trimmed);
    setInputFocused(false);
    inputRef.current?.blur();
    addToHistory(trimmed);
  }, [addToHistory]);

  const queryRef = useRef(query);
  queryRef.current = query;

  const resetSearch = useCallback(() => {
    setQuery("");
    setSubmittedQuery("");
    setMediaFilter("all");
  }, []);

  const navigation = useNavigation<NavProp>();

  // Warm up CFs on first visit
  useEffect(() => {
    warmupSearchCFs();
  }, []);

  // Only reset search on re-tap of search tab (not on initial switch to it)
  const isFocusedRef = useRef(false);
  useEffect(() => {
    const parent = navigation.getParent();
    if (!parent) return;
    const unsubFocus = parent.addListener("focus", () => {
      isFocusedRef.current = true;
    });
    const unsubBlur = parent.addListener("blur", () => {
      isFocusedRef.current = false;
    });
    // Set initial state
    isFocusedRef.current = (parent as any).isFocused?.() ?? false;
    return () => {
      unsubFocus();
      unsubBlur();
    };
  }, [navigation]);

  useEffect(() => {
    const parent = navigation.getParent();
    if (!parent) return;
    const unsub = (parent as any).addListener("tabPress", () => {
      if (!isFocusedRef.current) return; // switching TO search, not re-tap
      const state = navigation.getState();
      if (state && state.routes.length > 1) {
        navigation.popToTop();
      } else if (queryRef.current.length > 0) {
        resetSearch();
      }
    });
    return unsub;
  }, [navigation, resetSearch]);
  const user = useAuthStore((s) => s.user);
  const apiKey = useAuthStore((s) => s.appTmdbApiKey);
  const queryClient = useQueryClient();
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
        item.media_type ||
        (item.first_air_date || (item.name && !item.title)
          ? MediaType.TV
          : MediaType.MOVIE);

      if (mediaType === MediaType.MOVIE) {
        const releaseDate = item.release_date || null;
        const today = new Date().toISOString().split("T")[0];
        const isUnreleased = releaseDate && releaseDate > today;

        if (isUnreleased) {
          // Run modal check and add in parallel
          const addPromise = withLoadingId(item.id, () =>
            addToTracking(user.uid!, item.id, MediaType.MOVIE, releaseDate, {
              title: item.title || item.name || "",
              posterPath: item.poster_path || null,
            }),
          );
          shouldShowUnreleasedModal(user.uid!).then((shouldShow) => {
            if (shouldShow) {
              setUnreleasedModal({ title: item.title || item.name || "" });
            }
          });
          await addPromise;
          const movieEp = {
            tmdbShowId: item.id,
            showTitle: item.title || item.name || "",
            posterPath: item.poster_path || null,
            season: 0,
            episode: 0,
            episodeTitle: item.title || item.name || "",
            airDate: releaseDate!,
            runtime: null,
            mediaType: MediaType.MOVIE,
          };
          addShowToUpcoming(item.id, movieEp);
          addMovieToCalendarGlobal(movieEp);
          emitShowAdded(
            buildOptimisticItem(
              item.id,
              MediaType.MOVIE,
              item.title || item.name || "",
              item.poster_path || null,
              null,
              null,
              null,
              null,
              releaseDate,
            ),
          );
          return;
        }

        // Released movie — show add/add+watch modal
        setMovieModal(item);
        return;
      }

      // Show spinner during resume check
      await withLoadingId(item.id, async () => {
        // Check for existing watch history (re-add case)
        const highestEp = await getHighestWatchedEpisode(user.uid!, item.id);
        if (highestEp) {
          const nextEp = {
            season: highestEp.season,
            episode: highestEp.episode + 1,
          };
          setResumeModal({
            item,
            highestEp,
            nextEp,
            nextEpName: null,
            nextEpAirDate: null,
          });
          return;
        }

        const title = item.title || item.name || "";
        const poster = item.poster_path || null;

        // Fetch ep info first so tracking doc has it from the start
        const epInfo = await fetchFirstEpisodeInfo(item.id, apiKey);

        await addToTracking(user.uid!, item.id, mediaType, undefined, {
          title,
          posterPath: poster,
          nextEpisodeName: epInfo.name,
          nextEpisodeAirDate: epInfo.airDate,
        });

        // Optimistic insert into watchlist
        emitShowAdded(
          buildOptimisticItem(
            item.id,
            MediaType.TV,
            title,
            poster,
            { season: 1, episode: 1 },
            epInfo.name,
            epInfo.airDate,
            epInfo.catalog,
          ),
        );

        // Build upcoming episodes — all future eps from catalog or TMDB season data
        const todayLocal = new Date().toISOString().split("T")[0];
        const upcomingEps: UpcomingEpisode[] = [];

        if (epInfo.catalog?.seasons?.length) {
          // Full catalog — add all future episodes across all seasons
          for (const s of epInfo.catalog.seasons) {
            if (s.seasonNumber === 0) continue;
            for (const ep of s.episodes) {
              if (ep.airDate && ep.airDate >= todayLocal) {
                upcomingEps.push({
                  tmdbShowId: item.id,
                  showTitle: title,
                  posterPath: poster,
                  season: s.seasonNumber,
                  episode: ep.episodeNumber,
                  episodeTitle: ep.title || "",
                  airDate: ep.airDate,
                  runtime: ep.runtime ?? null,
                  mediaType: MediaType.TV,
                });
              }
            }
          }
        } else if (epInfo.tmdbEpisodes.length > 0) {
          // No catalog but TMDB returned season 1 episodes — add all future ones
          for (const ep of epInfo.tmdbEpisodes) {
            if (ep.airDate && ep.airDate >= todayLocal) {
              upcomingEps.push({
                tmdbShowId: item.id,
                showTitle: title,
                posterPath: poster,
                season: ep.season,
                episode: ep.episode,
                episodeTitle: ep.name || title,
                airDate: ep.airDate,
                runtime: ep.runtime ?? null,
                mediaType: MediaType.TV,
              });
            }
          }
        }
        // No ep data at all → skip. syncCatalog CF will populate later.

        if (upcomingEps.length > 0) {
          addShowToUpcoming(item.id, upcomingEps);
          for (const ep of upcomingEps) {
            addMovieToCalendarGlobal(ep);
          }
        }
      });
    },
    [user?.uid, apiKey, withLoadingId, addShowToUpcoming],
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
      const removeMediaType: MediaType =
        removeModal.media_type ||
        (removeModal.first_air_date || (removeModal.name && !removeModal.title)
          ? MediaType.TV
          : MediaType.MOVIE);
      await removeFromTracking(user.uid, removeModal.id, removeMediaType);
      removeShowFromUpcoming(removeModal.id);
      removeShowFromCalendarGlobal(removeModal.id);
      emitShowRemoved(removeModal.id);
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
    await withLoadingId(item.id, async () => {
      const title = item.title || item.name || "";
      const poster = item.poster_path || null;
      await addToTracking(user.uid!, item.id, MediaType.MOVIE, undefined, {
        title,
        posterPath: poster,
      });
      emitShowAdded(
        buildOptimisticItem(
          item.id,
          MediaType.MOVIE,
          title,
          poster,
          null,
          null,
          null,
          null,
          item.release_date || null,
        ),
      );
    });
  }, [user?.uid, movieModal, withLoadingId]);

  const handleMovieAddAndWatch = useCallback(async () => {
    if (!user?.uid || !movieModal) return;
    const item = movieModal;
    setMovieModal(null);
    await withLoadingId(item.id, async () => {
      await addAndMarkMovieWatched(
        user.uid!,
        item.id,
        (item as any).runtime ?? 0,
        {
          title: item.title || item.name || "",
          posterPath: item.poster_path || null,
        },
      );
      // Update query cache directly — no refetch
      const now = Timestamp.now();
      queryClient.setQueryData<any>(
        [QueryKey.WATCHED_MOVIES, user.uid!],
        (old: any) => {
          if (!old?.pages) return old;
          const newMovie = {
            id: `${item.id}_watched`,
            tmdbId: item.id,
            watchedAt: now,
            lastWatchedAt: now,
            runtime: (item as any).runtime ?? 0,
            watchCount: 1,
            title: item.title || item.name || "",
            posterPath: item.poster_path || null,
          } as WatchedMovie;
          const firstPage = old.pages[0];
          return {
            ...old,
            pages: [
              { ...firstPage, movies: [newMovie, ...firstPage.movies] },
              ...old.pages.slice(1),
            ],
          };
        },
      );
    });
  }, [user?.uid, movieModal, withLoadingId, queryClient]);

  const handleResumeFromWhere = useCallback(async () => {
    if (!user?.uid || !resumeModal) return;
    const { item, nextEp, nextEpName, nextEpAirDate } = resumeModal;
    setResumeModal(null);
    await withLoadingId(item.id, async () => {
      const title = item.title || item.name || "";
      const poster = item.poster_path || null;

      await addToTracking(user.uid!, item.id, MediaType.TV, undefined, {
        title,
        posterPath: poster,
        nextEpisodeName: nextEpName,
        nextEpisodeAirDate: nextEpAirDate,
      });
      // Update tracking doc to resume position (nextEpisode override)
      const db = getFirestore();
      await updateDoc(
        doc(
          db,
          "users",
          user.uid!,
          "tracking",
          showDocId(item.id, MediaType.TV),
        ),
        {
          nextEpisode: nextEp,
          nextEpisodeName: nextEpName,
          nextEpisodeAirDate: nextEpAirDate,
        },
      );

      // Use cached catalog for enrichment (0 Firestore reads)
      const catalog = getCachedCatalogShow(item.id, MediaType.TV);

      emitShowAdded(
        buildOptimisticItem(
          item.id,
          MediaType.TV,
          title,
          poster,
          nextEp,
          nextEpName,
          nextEpAirDate,
          catalog,
        ),
      );

      if (nextEpAirDate) {
        addShowToUpcoming(item.id, {
          tmdbShowId: item.id,
          showTitle: title,
          posterPath: poster,
          season: nextEp.season,
          episode: nextEp.episode,
          episodeTitle: nextEpName || "",
          airDate: nextEpAirDate,
          runtime: null,
        });
      }
    });
  }, [user?.uid, resumeModal, withLoadingId, addShowToUpcoming]);

  const handleStartFresh = useCallback(async () => {
    if (!user?.uid || !resumeModal) return;
    const item = resumeModal.item;
    setResumeModal(null);
    await withLoadingId(item.id, async () => {
      const title = item.title || item.name || "";
      const poster = item.poster_path || null;

      const epInfo = await fetchFirstEpisodeInfo(item.id, apiKey);

      await addToTracking(user.uid!, item.id, MediaType.TV, undefined, {
        title,
        posterPath: poster,
        nextEpisodeName: epInfo.name,
        nextEpisodeAirDate: epInfo.airDate,
      });

      emitShowAdded(
        buildOptimisticItem(
          item.id,
          MediaType.TV,
          title,
          poster,
          { season: 1, episode: 1 },
          epInfo.name,
          epInfo.airDate,
          epInfo.catalog,
        ),
      );

      const todayFresh = new Date().toISOString().split("T")[0];
      const freshUpcomingEps: UpcomingEpisode[] = [];

      if (epInfo.catalog?.seasons?.length) {
        for (const s of epInfo.catalog.seasons) {
          if (s.seasonNumber === 0) continue;
          for (const ep of s.episodes) {
            if (ep.airDate && ep.airDate >= todayFresh) {
              freshUpcomingEps.push({
                tmdbShowId: item.id,
                showTitle: title,
                posterPath: poster,
                season: s.seasonNumber,
                episode: ep.episodeNumber,
                episodeTitle: ep.title || "",
                airDate: ep.airDate,
                runtime: ep.runtime ?? null,
                mediaType: MediaType.TV,
              });
            }
          }
        }
      } else if (epInfo.tmdbEpisodes.length > 0) {
        for (const ep of epInfo.tmdbEpisodes) {
          if (ep.airDate && ep.airDate >= todayFresh) {
            freshUpcomingEps.push({
              tmdbShowId: item.id,
              showTitle: title,
              posterPath: poster,
              season: ep.season,
              episode: ep.episode,
              episodeTitle: ep.name || title,
              airDate: ep.airDate,
              runtime: ep.runtime ?? null,
              mediaType: MediaType.TV,
            });
          }
        }
      }

      if (freshUpcomingEps.length > 0) {
        addShowToUpcoming(item.id, freshUpcomingEps);
        for (const ep of freshUpcomingEps) {
          addMovieToCalendarGlobal(ep);
        }
      }
    });
  }, [user?.uid, apiKey, resumeModal, withLoadingId, addShowToUpcoming]);

  const {
    data: searchData,
    isLoading: searchLoading,
    fetchNextPage,
    hasNextPage,
  } = useSearch(submittedQuery, mediaFilter);

  const { data: trending, isLoading: trendingLoading } = useTrending("all");

  const filteredTrending = trending?.filter((item) => {
    if (mediaFilter === "all") return true;
    const mt = item.media_type || (item.title ? "movie" : "tv");
    return mt === mediaFilter;
  });

  const displayData =
    submittedQuery.length > 0 ? searchData?.results : filteredTrending;
  const isLoading =
    submittedQuery.length > 0 ? searchLoading : trendingLoading;

  // Show suggestions when typing + focused, hide when results are showing
  const showSuggestions = inputFocused && query.length > 0 && suggestions.length > 0;

  const handlePress = useCallback(
    (item: TMDBShow) => {
      const mediaType: MediaType =
        item.media_type ||
        (item.first_air_date || (item.name && !item.title)
          ? MediaType.TV
          : MediaType.MOVIE);
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
        item.media_type ||
        (item.first_air_date || (item.name && !item.title)
          ? MediaType.TV
          : MediaType.MOVIE);
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
          onChangeText={(text) => {
            setQuery(text);
            if (text.length === 0) setSubmittedQuery("");
          }}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setTimeout(() => setInputFocused(false), 200)}
          onSubmitEditing={() => submitSearch(query)}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => {
              setQuery("");
              setSubmittedQuery("");
              inputRef.current?.focus();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.clearButtonText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {!showSuggestions && (
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
      )}

      {showSuggestions && (
        <View style={styles.historyDropdown}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 240 }}>
            {suggestions.map((term, idx) => (
              <TouchableOpacity
                key={`${term}_${idx}`}
                style={styles.historyItem}
                onPress={() => submitSearch(term)}
              >
                <Text style={styles.historyIcon}>{idx === 0 ? "🔍" : "↻"}</Text>
                <Text style={styles.historyText} numberOfLines={1}>{term}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {!submittedQuery && !showSuggestions && <Text style={styles.sectionTitle}>Trending</Text>}

      {showSuggestions ? null : isLoading ? (
        <View style={styles.center}>
          <LoadingSpinner />
        </View>
      ) : !isLoading &&
        submittedQuery.length > 0 &&
        (!displayData || displayData.length === 0) ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No results found</Text>
        </View>
      ) : (
        <LegendList
          data={displayData || []}
          keyExtractor={(item) => `${item.media_type || "x"}_${item.id}`}
          renderItem={renderItem}
          extraData={[watchlistIds, addingIds]}
          numColumns={3}
          estimatedItemSize={200}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.grid}
          onEndReached={() => {
            if (submittedQuery && hasNextPage) fetchNextPage();
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

      <AnimatedModal
        visible={!!resumeModal}
        onClose={() => setResumeModal(null)}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {resumeModal?.item?.name || resumeModal?.item?.title}
          </Text>
          <Text
            style={[
              styles.modalCancelText,
              { marginBottom: spacing.lg, textAlign: "center" },
            ]}
          >
            You've previously watched up to S
            {String(resumeModal?.highestEp?.season).padStart(2, "0")}E
            {String(resumeModal?.highestEp?.episode).padStart(2, "0")}
          </Text>
          <TouchableOpacity
            style={styles.modalButton}
            onPress={handleResumeFromWhere}
          >
            <Text style={styles.modalButtonText}>
              Resume from S
              {String(resumeModal?.nextEp?.season).padStart(2, "0")}E
              {String(resumeModal?.nextEp?.episode).padStart(2, "0")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modalButton,
              { backgroundColor: colors.surfaceLight },
            ]}
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
  historyDropdown: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginBottom: spacing.sm,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  historyIcon: {
    color: colors.textMuted,
    fontSize: 14,
    marginRight: spacing.sm,
  },
  historyText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
});
