import React, { memo, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { useSeasonDetails, useShowWatchedEpisodes } from "../hooks";
import { useAuthStore } from "../stores";
import {
  markEpisodeWatched,
  markSeasonWatchedCF,
  addToTracking,
  unmarkEpisodeWatched,
  decrementEpisodeWatchCount,
  unmarkSeasonWatched,
  decrementSeasonWatchCount,
  getSeasonDetails as fetchSeason,
} from "../services";
import WatchActionSheet, { WatchAction } from "./WatchActionSheet";
import ConfirmModal from "./ConfirmModal";
import { colors, spacing, typography, posterSize } from "../theme";
import { TMDBSeason, TMDBEpisode, MediaType } from "../types";

interface Props {
  tmdbId: number;
  season: TMDBSeason;
  showPosterPath: string | null;
  isTracked?: boolean;
  preloadedEpisodes?: TMDBEpisode[];
}

export default memo(function SeasonDropdown({ tmdbId, season, showPosterPath, isTracked, preloadedEpisodes }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [marking, setMarking] = useState<number | null>(null);
  const [markingSeason, setMarkingSeason] = useState(false);
  const user = useAuthStore((s) => s.user);
  const apiKey = useAuthStore((s) => s.appTmdbApiKey)!;
  const { data: seasonData, isLoading } = useSeasonDetails(
    tmdbId,
    season.season_number,
    !preloadedEpisodes, // skip fetch if preloaded
  );

  const { episodes: watchedEps, loading: watchedLoading } = useShowWatchedEpisodes(user?.uid, tmdbId);

  // Add-to-watchlist modal state
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addModalLoading, setAddModalLoading] = useState(false);
  const [addModalError, setAddModalError] = useState<string | null>(null);
  const pendingAction = useRef<(() => Promise<void>) | null>(null);

  const guardTracking = useCallback(
    (action: () => Promise<void>): boolean => {
      if (isTracked) return true;
      pendingAction.current = action;
      setAddModalError(null);
      setAddModalVisible(true);
      return false;
    },
    [isTracked]
  );

  const handleAddAndMark = useCallback(
    async () => {
      if (!user?.uid) return;
      setAddModalLoading(true);
      setAddModalError(null);
      try {
        await addToTracking(user.uid, tmdbId, MediaType.TV);
        setAddModalVisible(false);
        const action = pendingAction.current;
        pendingAction.current = null;
        if (action) await action();
      } catch (err: any) {
        setAddModalError(err.message || "Failed to add to watchlist.");
      } finally {
        setAddModalLoading(false);
      }
    },
    [user?.uid, tmdbId]
  );

  // Action sheet state
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetTarget, setSheetTarget] = useState<{
    type: "episode";
    ep: TMDBEpisode;
    watchCount: number;
  } | {
    type: "season";
    watchCount: number;
  } | null>(null);

  const watchedMap = new Map<number, { watchCount: number; runtime: number }>();
  for (const ep of watchedEps) {
    if (ep.season === season.season_number) {
      watchedMap.set(ep.episode, { watchCount: ep.watchCount, runtime: ep.runtime });
    }
  }

  const watchedCount = watchedMap.size;
  const episodes = preloadedEpisodes ?? seasonData?.episodes ?? [];
  const minWatchCount = episodes.length > 0
    ? Math.min(...episodes.map((ep: TMDBEpisode) => watchedMap.get(ep.episode_number)?.watchCount || 0))
    : 0;
  const allWatched = episodes.length > 0 && minWatchCount > 0;

  const getNextEpisodeInfo = useCallback(
    async (afterSeason: number, afterEpisode?: number) => {
      const eps = episodes;
      if (afterEpisode !== undefined) {
        const nextInSeason = eps.find(
          (e: TMDBEpisode) => e.episode_number === afterEpisode + 1
        );
        if (nextInSeason) {
          return {
            nextEpisode: { season: afterSeason, episode: nextInSeason.episode_number },
            isComplete: false,
          };
        }
      }
      try {
        const nextSeasonData = await fetchSeason(apiKey, tmdbId, afterSeason + 1);
        const ns = nextSeasonData as { episodes: Array<{ episode_number: number }> };
        if (ns.episodes?.length > 0) {
          return {
            nextEpisode: { season: afterSeason + 1, episode: 1 },
            isComplete: false,
          };
        }
      } catch {}
      return { nextEpisode: null, isComplete: true };
    },
    [seasonData, apiKey, tmdbId]
  );

  const doMarkSeasonWatched = useCallback(
    async () => {
      if (!user?.uid || markingSeason) return;
      const eps = episodes;
      if (eps.length === 0) return;

      setMarkingSeason(true);
      try {
        const { nextEpisode, isComplete } = await getNextEpisodeInfo(season.season_number);

        await markSeasonWatchedCF(
          tmdbId,
          season.season_number,
          eps.map((ep: TMDBEpisode) => ({
            episodeNumber: ep.episode_number,
            name: ep.name,
            runtime: ep.runtime || 0,
          })),
          nextEpisode,
          isComplete,
        );
      } catch (err: any) {
        console.error("markSeasonWatched failed:", err);
        Alert.alert("Error", err.message || "Failed to mark season as watched.");
      } finally {
        setMarkingSeason(false);
      }
    },
    [user?.uid, markingSeason, seasonData, tmdbId, season.season_number, getNextEpisodeInfo]
  );

  const handleMarkSeasonWatched = useCallback(
    async () => {
      if (guardTracking(doMarkSeasonWatched)) {
        await doMarkSeasonWatched();
      }
    },
    [guardTracking, doMarkSeasonWatched]
  );

  const doMarkEpisodeWatched = useCallback(
    async (ep: TMDBEpisode) => {
      if (!user?.uid || marking !== null) return;
      setMarking(ep.episode_number);

      try {
        const { nextEpisode, isComplete } = await getNextEpisodeInfo(
          season.season_number,
          ep.episode_number
        );

        await markEpisodeWatched(
          user.uid,
          tmdbId,
          season.season_number,
          ep.episode_number,
          ep.name,
          ep.runtime || 0,
          nextEpisode,
          isComplete
        );
      } catch (err: any) {
        console.error("markEpisodeWatched failed:", err);
        Alert.alert("Error", err.message || "Failed to mark episode as watched.");
      } finally {
        setMarking(null);
      }
    },
    [user?.uid, marking, tmdbId, season.season_number, getNextEpisodeInfo]
  );

  const handleMarkWatched = useCallback(
    async (ep: TMDBEpisode) => {
      if (guardTracking(() => doMarkEpisodeWatched(ep))) {
        await doMarkEpisodeWatched(ep);
      }
    },
    [guardTracking, doMarkEpisodeWatched]
  );

  const handleSheetAction = useCallback(
    async (action: WatchAction) => {
      if (!user?.uid || !sheetTarget) return;

      try {
        if (sheetTarget.type === "episode") {
          const ep = sheetTarget.ep;
          const watched = watchedMap.get(ep.episode_number);
          if (action === "rewatch") {
            await handleMarkWatched(ep);
          } else if (action === "not_watched") {
            await unmarkEpisodeWatched(
              user.uid, tmdbId, season.season_number,
              ep.episode_number, watched?.runtime || ep.runtime || 0
            );
          } else if (action === "watched_once_less") {
            await decrementEpisodeWatchCount(
              user.uid, tmdbId, season.season_number,
              ep.episode_number, watched?.runtime || ep.runtime || 0,
              watched?.watchCount || 1
            );
          }
        } else if (sheetTarget.type === "season") {
          if (action === "rewatch") {
            await handleMarkSeasonWatched();
          } else if (action === "not_watched") {
            const toUnmark = (episodes)
              .filter((ep: TMDBEpisode) => watchedMap.has(ep.episode_number))
              .map((ep: TMDBEpisode) => ({
                season: season.season_number,
                episode: ep.episode_number,
                runtime: watchedMap.get(ep.episode_number)!.runtime,
              }));
            if (toUnmark.length > 0) {
              await unmarkSeasonWatched(user.uid, tmdbId, toUnmark);
            }
          } else if (action === "watched_once_less") {
            const toDecrement = (episodes)
              .filter((ep: TMDBEpisode) => {
                const w = watchedMap.get(ep.episode_number);
                return w && w.watchCount > 0;
              })
              .map((ep: TMDBEpisode) => {
                const w = watchedMap.get(ep.episode_number)!;
                return {
                  season: season.season_number,
                  episode: ep.episode_number,
                  runtime: w.runtime,
                  watchCount: w.watchCount,
                };
              });
            if (toDecrement.length > 0) {
              await decrementSeasonWatchCount(user.uid, tmdbId, toDecrement);
            }
          }
        }
      } catch (err: any) {
        console.error("Watch action failed:", err);
        Alert.alert("Error", err.message || "Action failed.");
      }
      setSheetTarget(null);
    },
    [user?.uid, sheetTarget, tmdbId, season.season_number, seasonData, watchedMap, handleMarkWatched, handleMarkSeasonWatched]
  );

  const doMarkEpisodeRange = useCallback(
    async (fromEp: number, toEp: number) => {
      if (!user?.uid) return;
      const eps = episodes;
      const epsToMark = eps.filter(
        (e: TMDBEpisode) =>
          e.episode_number >= fromEp &&
          e.episode_number <= toEp &&
          !watchedMap.has(e.episode_number)
      );
      if (epsToMark.length === 0) return;

      setMarking(toEp);
      try {
        for (const ep of epsToMark) {
          const isLast = ep.episode_number === toEp;
          const { nextEpisode, isComplete } = isLast
            ? await getNextEpisodeInfo(season.season_number, ep.episode_number)
            : { nextEpisode: null, isComplete: false };

          await markEpisodeWatched(
            user.uid,
            tmdbId,
            season.season_number,
            ep.episode_number,
            ep.name,
            ep.runtime || 0,
            nextEpisode,
            isComplete,
            !isLast, // skipTrackingUpdate for all except last
          );
        }
      } catch (err: any) {
        console.error("markEpisodeRange failed:", err);
        Alert.alert("Error", err.message || "Failed to mark episodes.");
      } finally {
        setMarking(null);
      }
    },
    [user?.uid, seasonData, watchedMap, tmdbId, season.season_number, getNextEpisodeInfo]
  );

  const markEpisodeRange = useCallback(
    async (fromEp: number, toEp: number) => {
      if (guardTracking(() => doMarkEpisodeRange(fromEp, toEp))) {
        await doMarkEpisodeRange(fromEp, toEp);
      }
    },
    [guardTracking, doMarkEpisodeRange]
  );

  const handleEpisodePress = useCallback(
    (ep: TMDBEpisode) => {
      const count = watchedMap.get(ep.episode_number)?.watchCount || 0;
      if (count > 0) {
        handleMarkWatched(ep);
        return;
      }

      if (!isTracked) {
        handleMarkWatched(ep);
        return;
      }

      // Check for skipped unwatched episodes before this one
      const eps = episodes;
      const skipped = eps.filter(
        (e: TMDBEpisode) =>
          e.episode_number < ep.episode_number &&
          !watchedMap.has(e.episode_number)
      );

      if (skipped.length > 0) {
        const firstSkipped = skipped[0].episode_number;
        Alert.alert(
          "Skipped Episodes",
          `Mark episodes ${firstSkipped}–${ep.episode_number} as watched?`,
          [
            {
              text: "Just This One",
              onPress: () => handleMarkWatched(ep),
            },
            {
              text: "Mark All Previous",
              onPress: () => markEpisodeRange(firstSkipped, ep.episode_number),
            },
            { text: "Cancel", style: "cancel" },
          ]
        );
      } else {
        handleMarkWatched(ep);
      }
    },
    [watchedMap, handleMarkWatched, isTracked, seasonData, markEpisodeRange]
  );

  const handleEpisodeLongPress = useCallback(
    (ep: TMDBEpisode) => {
      const count = watchedMap.get(ep.episode_number)?.watchCount || 0;
      if (count > 0) {
        setSheetTarget({ type: "episode", ep, watchCount: count });
        setSheetVisible(true);
      }
    },
    [watchedMap]
  );

  const handleSeasonPress = useCallback(
    (e: any) => {
      e.stopPropagation?.();
      if (allWatched) {
        // Already fully watched → rewatch directly
        handleMarkSeasonWatched();
      } else {
        handleMarkSeasonWatched();
      }
    },
    [allWatched, handleMarkSeasonWatched]
  );

  const handleSeasonLongPress = useCallback(() => {
    if (allWatched) {
      setSheetTarget({ type: "season", watchCount: minWatchCount });
      setSheetVisible(true);
    }
  }, [allWatched, minWatchCount]);

  const sheetLabel =
    sheetTarget?.type === "season"
      ? `${season.name}`
      : sheetTarget?.type === "episode"
        ? `S${String(season.season_number).padStart(2, "0")}E${String(sheetTarget.ep.episode_number).padStart(2, "0")} - ${sheetTarget.ep.name}`
        : "";

  return (
    <View>
      <TouchableOpacity
        style={styles.seasonRow}
        onPress={() => setExpanded(!expanded)}
      >
        <Image
          source={{
            uri: `${posterSize.small}${season.poster_path || showPosterPath}`,
          }}
          style={styles.seasonPoster}
          contentFit="cover"
        />
        <View style={styles.seasonInfo}>
          <Text style={styles.seasonName}>{season.name}</Text>
          <View style={styles.seasonMetaRow}>
            {watchedLoading ? (
              <ActivityIndicator size={10} color={colors.textMuted} style={{ marginRight: 4 }} />
            ) : null}
            <Text style={styles.seasonMeta}>
              {watchedLoading ? "" : `${watchedCount}/`}{season.episode_count} episodes
              {season.air_date ? ` · ${season.air_date.substring(0, 4)}` : ""}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[
            styles.seasonCheckmark,
            allWatched && styles.seasonCheckmarkWatched,
            markingSeason && { opacity: 0.5 },
          ]}
          onPress={handleSeasonPress}
          onLongPress={handleSeasonLongPress}
          disabled={markingSeason || marking !== null || watchedLoading}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {markingSeason ? (
            <ActivityIndicator size="small" color={allWatched ? colors.text : colors.textMuted} />
          ) : (
            <Text
              style={[
                styles.seasonCheckmarkText,
                allWatched && styles.seasonCheckmarkTextWatched,
              ]}
            >
              {allWatched ? minWatchCount.toString() : "✓"}
            </Text>
          )}
        </TouchableOpacity>
        <Text style={styles.chevron}>{expanded ? "▾" : "›"}</Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.episodeList}>
          {isLoading ? (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={styles.loader}
            />
          ) : (
            (episodes).map((ep: TMDBEpisode) => {
              const watched = watchedMap.get(ep.episode_number);
              const count = watched?.watchCount || 0;
              const isWatched = count > 0;

              return (
                <View key={ep.episode_number} style={styles.episodeRow}>
                  <View style={styles.episodeInfo}>
                    <Text style={styles.episodeNumber}>
                      E{String(ep.episode_number).padStart(2, "0")}
                    </Text>
                    <View style={styles.episodeText}>
                      <Text style={styles.episodeName} numberOfLines={1}>
                        {ep.name}
                      </Text>
                      {ep.air_date && (
                        <Text style={styles.episodeMeta}>{ep.air_date}</Text>
                      )}
                      {count > 1 && (
                        <Text style={styles.rewatchBadge}>
                          Watched {count}x
                        </Text>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.checkmark,
                      isWatched && styles.checkmarkWatched,
                      marking === ep.episode_number && { opacity: 0.5 },
                    ]}
                    onPress={() => handleEpisodePress(ep)}
                    onLongPress={() => handleEpisodeLongPress(ep)}
                    disabled={marking !== null || markingSeason}
                  >
                    {marking === ep.episode_number ? (
                      <ActivityIndicator size="small" color={colors.textMuted} />
                    ) : (
                      <Text
                        style={[
                          styles.checkmarkText,
                          isWatched && styles.checkmarkTextWatched,
                        ]}
                      >
                        {isWatched ? count.toString() : "✓"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      )}

      <WatchActionSheet
        visible={sheetVisible}
        label={sheetLabel}
        watchCount={sheetTarget?.watchCount || 0}
        onSelect={handleSheetAction}
        onClose={() => {
          setSheetVisible(false);
          setSheetTarget(null);
        }}
      />

      <ConfirmModal
        visible={addModalVisible}
        title="Add to Watchlist?"
        hint="This show isn't in your watchlist yet. Add it to mark episodes as watched."
        error={addModalError}
        confirmLabel="Add & Mark"
        confirmColor={colors.primary}
        loading={addModalLoading}
        onConfirm={handleAddAndMark}
        onClose={() => {
          setAddModalVisible(false);
          pendingAction.current = null;
        }}
      />
    </View>
  );
})

const styles = StyleSheet.create({
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
  seasonMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  seasonMeta: {
    ...typography.caption,
  },
  seasonCheckmark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: colors.textMuted,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.sm,
  },
  seasonCheckmarkWatched: {
    backgroundColor: colors.watchedGreen,
    borderColor: colors.watchedGreen,
  },
  seasonCheckmarkText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  seasonCheckmarkTextWatched: {
    color: colors.text,
    fontWeight: "700",
  },
  chevron: {
    ...typography.title,
    color: colors.textMuted,
    fontSize: 18,
  },
  episodeList: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    marginBottom: spacing.sm,
  },
  loader: {
    paddingVertical: spacing.lg,
  },
  episodeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  episodeInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  episodeNumber: {
    ...typography.subtitle,
    color: colors.textMuted,
    width: 35,
    fontSize: 13,
  },
  episodeText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  episodeName: {
    ...typography.body,
    fontSize: 13,
  },
  episodeMeta: {
    ...typography.caption,
    marginTop: 2,
    fontSize: 11,
  },
  rewatchBadge: {
    ...typography.caption,
    color: colors.accent,
    marginTop: 2,
    fontSize: 11,
  },
  checkmark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.textMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  checkmarkWatched: {
    backgroundColor: colors.watchedGreen,
    borderColor: colors.watchedGreen,
  },
  checkmarkText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  checkmarkTextWatched: {
    color: colors.text,
    fontWeight: "700",
  },
});
