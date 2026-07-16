import { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors, spacing, typography, posterSize } from "../../../theme";
import { UpcomingEpisode } from "../../../types";

interface Props {
  episode: UpcomingEpisode;
  onPress: (tmdbShowId: number) => void;
}

export default memo(function UpcomingEpisodeRow({ episode, onPress }: Props) {
  const label = `S${String(episode.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(episode.tmdbShowId)}
      activeOpacity={0.8}
    >
      {episode.posterPath ? (
        <Image
          source={{ uri: `${posterSize.small}${episode.posterPath}` }}
          style={styles.poster}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.poster, styles.noPoster]}>
          <Text style={styles.noPosterText}>?</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.showTitle} numberOfLines={1}>
          {episode.showTitle}
        </Text>
        <Text style={styles.epLabel}>{label}</Text>
        <Text style={styles.epTitle} numberOfLines={1}>
          {episode.episodeTitle}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  poster: {
    width: 45,
    height: 67,
    borderRadius: 4,
  },
  noPoster: {
    backgroundColor: colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  noPosterText: {
    ...typography.subtitle,
    color: colors.textMuted,
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
  },
  showTitle: {
    ...typography.subtitle,
    fontSize: 14,
  },
  epLabel: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  epTitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontSize: 13,
  },
});
