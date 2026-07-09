import React, { memo, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { colors, spacing, typography, posterSize } from "../theme";
import { UpcomingEpisode } from "../types";
import SwipeableCard, { SwipeableCardRef } from "./SwipeableCard";

interface Props {
  episode: UpcomingEpisode;
  isWatched?: boolean;
  onSwipeLeft: () => Promise<void>;
  onSwipeRight: () => Promise<void>;
  onPress: () => void;
  onCheckmark: () => Promise<void>;
}

export default memo(function EpisodeCard({
  episode,
  isWatched,
  onSwipeLeft,
  onSwipeRight,
  onPress,
  onCheckmark,
}: Props) {
  const label = `S${String(episode.season).padStart(2, "0")}E${String(episode.episode).padStart(2, "0")}`;
  const swipeRef = useRef<SwipeableCardRef>(null);

  if (isWatched) {
    return (
      <TouchableOpacity
        style={[styles.container, styles.watchedContainer]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Image
          source={{ uri: `${posterSize.small}${episode.posterPath}` }}
          style={[styles.poster, styles.watchedPoster]}
          contentFit="cover"
        />
        <View style={styles.info}>
          <Text style={[styles.showTitle, styles.watchedText]} numberOfLines={1}>
            {episode.showTitle}
          </Text>
          <Text style={[styles.episodeLabel, styles.watchedText]}>{label}</Text>
          <Text style={[styles.episodeTitle, styles.watchedText]} numberOfLines={1}>
            {episode.episodeTitle}
          </Text>
        </View>
        <View style={styles.watchedBadge}>
          <Text style={styles.watchedBadgeText}>✓</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <SwipeableCard ref={swipeRef} onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight} persistAfterSwipe>
      <TouchableOpacity
        style={styles.container}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Image
          source={{ uri: `${posterSize.small}${episode.posterPath}` }}
          style={styles.poster}
          contentFit="cover"
        />
        <View style={styles.info}>
          <Text style={styles.showTitle} numberOfLines={1}>
            {episode.showTitle}
          </Text>
          <Text style={styles.episodeLabel}>{label}</Text>
          <Text style={styles.episodeTitle} numberOfLines={1}>
            {episode.episodeTitle}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.checkmark}
          onPress={() => swipeRef.current?.triggerSwipeLeft()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.checkmarkText}>✓</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </SwipeableCard>
  );
})

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
  episodeLabel: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  episodeTitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  watchedText: {
    color: colors.textMuted,
  },
  checkmark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.textMuted,
    justifyContent: "center",
    alignItems: "center",
  },
  checkmarkText: {
    fontSize: 18,
    color: colors.textMuted,
  },
  watchedBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.watchedGreen,
    justifyContent: "center",
    alignItems: "center",
    opacity: 0.6,
  },
  watchedBadgeText: {
    fontSize: 18,
    color: colors.text,
    fontWeight: "700",
  },
});
