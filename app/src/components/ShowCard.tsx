import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { colors, spacing, typography, posterSize } from "../theme";
import { WatchlistItem } from "../types";
import SwipeableCard from "./SwipeableCard";

interface Props {
  item: WatchlistItem;
  onSwipeLeft: () => Promise<void>;
  onSwipeRight: () => Promise<void>;
  onPress: () => void;
  onCheckmark: () => Promise<void>;
}

export default function ShowCard({
  item,
  onSwipeLeft,
  onSwipeRight,
  onPress,
  onCheckmark,
}: Props) {
  const episodeLabel = item.nextEpisode
    ? `S${String(item.nextEpisode.season).padStart(2, "0")}E${String(item.nextEpisode.episode).padStart(2, "0")}`
    : item.mediaType === "movie"
      ? "Movie"
      : "";

  return (
    <SwipeableCard onSwipeLeft={onSwipeLeft} onSwipeRight={onSwipeRight}>
      <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.8}>
        <Image
          source={{ uri: `${posterSize.small}${item.posterPath}` }}
          style={styles.poster}
          contentFit="cover"
        />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.episode}>{episodeLabel}</Text>
          {item.rewatchCount > 0 && (
            <Text style={styles.rewatch}>
              Rewatch #{item.rewatchCount}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.checkmark}
          onPress={onCheckmark}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.checkmarkText}>✓</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </SwipeableCard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  poster: {
    width: 55,
    height: 82,
    borderRadius: 4,
  },
  info: {
    flex: 1,
    marginLeft: spacing.md,
  },
  title: {
    ...typography.subtitle,
  },
  episode: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  rewatch: {
    ...typography.caption,
    color: colors.accent,
    marginTop: spacing.xs,
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
});
