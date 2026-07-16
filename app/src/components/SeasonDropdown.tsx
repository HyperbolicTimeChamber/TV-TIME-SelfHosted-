import React, { memo, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useSeasonDetails, useWatchedEpisodes } from "../hooks";
import { useAuthStore } from "../stores/authStore";
import { markEpisodeWatched } from "../services/firestore";
import { getSeasonDetails as fetchSeason } from "../services/tmdb";
import { colors, spacing, typography, posterSize } from "../theme";
import { TMDBSeason, TMDBEpisode } from "../types";

interface Props {
  tmdbId: number;
  season: TMDBSeason;
  showPosterPath: string | null;
}

export default memo(function SeasonDropdown({ tmdbId, season, showPosterPath }: Props) {
  const [expanded, setExpanded] = useState(false);
  const user = useAuthStore((s) => s.user);
  const apiKey = useAuthStore((s) => s.appTmdbApiKey)!;

  const { data: seasonData, isLoading } = useSeasonDetails(
    tmdbId,
    season.season_number
  );

  const { episodes: watchedEps } = useWatchedEpisodes(user?.uid, tmdbId);

  const watchedMap = new Map<number, number>();
  for (const ep of watchedEps) {
    if (ep.season === season.season_number) {
      watchedMap.set(ep.episode, ep.watchCount);
    }
  }

  const watchedCount = watchedMap.size;

  const handleMarkWatched = useCallback(
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
          season: season.season_number,
          episode: nextEpInSeason.episode_number,
        };
      } else {
        try {
          const nextSeasonData = await fetchSeason(
            apiKey,
            tmdbId,
            season.season_number + 1
          );
          const ns = nextSeasonData as {
            episodes: Array<{ episode_number: number }>;
          };
          if (ns.episodes?.length > 0) {
            nextEpisode = { season: season.season_number + 1, episode: 1 };
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
        season.season_number,
        ep.episode_number,
        ep.name,
        ep.runtime || 0,
        nextEpisode,
        isComplete
      );
    },
    [user?.uid, seasonData, tmdbId, season.season_number, apiKey]
  );

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
          <Text style={styles.seasonMeta}>
            {watchedCount}/{season.episode_count} episodes
            {season.air_date ? ` · ${season.air_date.substring(0, 4)}` : ""}
          </Text>
        </View>
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
            (seasonData?.episodes || []).map((ep: TMDBEpisode) => {
              const count = watchedMap.get(ep.episode_number) || 0;
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
                    ]}
                    onPress={() => handleMarkWatched(ep)}
                  >
                    <Text
                      style={[
                        styles.checkmarkText,
                        isWatched && styles.checkmarkTextWatched,
                      ]}
                    >
                      {isWatched ? count.toString() : "✓"}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </View>
      )}
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
  seasonMeta: {
    ...typography.caption,
    marginTop: spacing.xs,
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
