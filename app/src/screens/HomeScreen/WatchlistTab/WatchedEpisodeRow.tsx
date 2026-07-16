import { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors, spacing, typography, posterSize } from "../../../theme";
import { WatchedEpisode } from "../../../types";
import { EnrichedTrackingItem } from "../../../hooks";

interface Props {
  episode: WatchedEpisode;
  show: EnrichedTrackingItem;
  onPress: (tmdbShowId: number) => void;
}

export default memo(function WatchedEpisodeRow({ episode, show, onPress }: Props) {
  const label = `S${String(episode.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`;

  return (
    <TouchableOpacity
      style={[styles.container, styles.watchedContainer]}
      onPress={() => onPress(episode.tmdbShowId)}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: `${posterSize.small}${show.posterPath}` }}
        style={[styles.poster, styles.watchedPoster]}
        contentFit="cover"
      />
      <View style={styles.info}>
        <Text style={[styles.showTitle, styles.watchedText]} numberOfLines={1}>
          {show.title}
        </Text>
        <Text style={[styles.label, styles.watchedText]}>{label}</Text>
        <Text style={[styles.epTitle, styles.watchedText]} numberOfLines={1}>
          {episode.episodeTitle}
        </Text>
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>✓</Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  watchedContainer: {
    opacity: 0.4,
  },
  poster: {
    width: 55,
    height: 82,
    borderRadius: 4,
  },
  watchedPoster: {
    opacity: 0.6,
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
  },
  showTitle: {
    ...typography.subtitle,
  },
  label: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  epTitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  watchedText: {
    color: colors.textMuted,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.watchedGreen,
    justifyContent: "center",
    alignItems: "center",
    opacity: 0.6,
  },
  badgeText: {
    fontSize: 18,
    color: colors.text,
    fontWeight: "700",
  },
});
