import React, { useMemo, useCallback, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { LoadingSpinner, ConfirmModal } from "../components";
import { LegendList } from "@legendapp/list/react-native";
import { useRoute, RouteProp } from "@react-navigation/native";
import { useSeasonDetails, useWatchedEpisodes, useWatchlist } from "../hooks";
import { useAuthStore } from "../stores";
import { markEpisodeWatched, addToTracking, getSeasonDetails as fetchSeason } from "../services";
import { colors, spacing, typography } from "../theme";
import { HomeStackParamList, TMDBEpisode, MediaType } from "../types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

type RouteParams = RouteProp<HomeStackParamList, "SeasonDetail">;

export default function SeasonDetailScreen() {
  const route = useRoute<RouteParams>();
  const { tmdbId, seasonNumber } = route.params;
  const user = useAuthStore((s) => s.user);
  const apiKey = useAuthStore((s) => s.appTmdbApiKey)!;
  const { data: seasonData, isLoading } = useSeasonDetails(tmdbId, seasonNumber);
  const { episodes: watchedEps } = useWatchedEpisodes(user?.uid, tmdbId);
  const { items: watchlist } = useWatchlist(user?.uid);

  const watchlistItem = useMemo(
    () => watchlist.find((w) => w.tmdbId === tmdbId),
    [watchlist, tmdbId]
  );

  // Add-to-watchlist modal state
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addModalLoading, setAddModalLoading] = useState(false);
  const [addModalError, setAddModalError] = useState<string | null>(null);
  const pendingAction = useRef<(() => Promise<void>) | null>(null);

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

  const watchedSet = useMemo(() => {
    const set = new Set<string>();
    for (const ep of watchedEps) {
      if (ep.season === seasonNumber) {
        set.add(`${ep.season}_${ep.episode}`);
      }
    }
    return set;
  }, [watchedEps, seasonNumber]);

  const doMarkWatched = useCallback(
    async (ep: TMDBEpisode) => {
      if (!user?.uid) return;

      const episodes = seasonData?.episodes || [];
      const nextEpInSeason = episodes.find(
        (e: TMDBEpisode) => e.episode_number === ep.episode_number + 1
      );

      let nextEpisode: { season: number; episode: number } | null = null;
      let isComplete = false;

      if (nextEpInSeason) {
        nextEpisode = {
          season: seasonNumber,
          episode: nextEpInSeason.episode_number,
        };
      } else {
        try {
          const nextSeasonData = await fetchSeason(apiKey, tmdbId, seasonNumber + 1);
          const ns = nextSeasonData as { episodes: Array<{ episode_number: number }> };
          if (ns.episodes?.length > 0) {
            nextEpisode = { season: seasonNumber + 1, episode: 1 };
          } else {
            isComplete = true;
          }
        } catch {
          isComplete = true;
        }
      }

      await markEpisodeWatched(
        user.uid,
        tmdbId,
        seasonNumber,
        ep.episode_number,
        ep.name,
        ep.runtime || 0,
        nextEpisode,
        isComplete
      );
    },
    [user?.uid, seasonData, tmdbId, seasonNumber, apiKey]
  );

  const handleMarkWatched = useCallback(
    (ep: TMDBEpisode) => {
      if (!watchlistItem) {
        pendingAction.current = () => doMarkWatched(ep);
        setAddModalError(null);
        setAddModalVisible(true);
        return;
      }
      doMarkWatched(ep);
    },
    [watchlistItem, doMarkWatched]
  );

  const renderEpisode = useCallback(
    ({ item }: { item: TMDBEpisode }) => {
      const isWatched = watchedSet.has(`${seasonNumber}_${item.episode_number}`);
      const watchedEp = watchedEps.find(
        (e) => e.season === seasonNumber && e.episode === item.episode_number
      );

      return (
        <View style={styles.episodeRow}>
          <View style={styles.episodeInfo}>
            <Text style={styles.episodeNumber}>
              E{String(item.episode_number).padStart(2, "0")}
            </Text>
            <View style={styles.episodeText}>
              <Text style={styles.episodeName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.air_date && (
                <Text style={styles.episodeMeta}>{formatDate(item.air_date)}</Text>
              )}
              {watchedEp && watchedEp.watchCount > 1 && (
                <Text style={styles.rewatchBadge}>
                  Watched {watchedEp.watchCount}x
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.checkmark,
              isWatched && styles.checkmarkWatched,
            ]}
            onPress={() => handleMarkWatched(item)}
          >
            <Text
              style={[
                styles.checkmarkText,
                isWatched && styles.checkmarkTextWatched,
              ]}
            >
              ✓
            </Text>
          </TouchableOpacity>
        </View>
      );
    },
    [watchedSet, watchedEps, seasonNumber, handleMarkWatched]
  );

  if (isLoading) {
    return (
      <View style={styles.center}>
        <LoadingSpinner />
      </View>
    );
  }

  return (
    <View style={styles.list}>
      <LegendList
        data={seasonData?.episodes || []}
        keyExtractor={(item) => String(item.episode_number)}
        renderItem={renderEpisode}
        estimatedItemSize={60}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
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
  episodeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
  },
  episodeText: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  episodeName: {
    ...typography.body,
  },
  episodeMeta: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  rewatchBadge: {
    ...typography.caption,
    color: colors.accent,
    marginTop: spacing.xs,
  },
  checkmark: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    fontSize: 16,
    color: colors.textMuted,
  },
  checkmarkTextWatched: {
    color: colors.text,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.lg,
  },
});
