import { useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Animated,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import AnimatedModal from "./AnimatedModal";
import { colors, spacing, typography, TMDB_IMAGE_BASE } from "../theme";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${Number.parseInt(d, 10)} ${MONTHS[Number.parseInt(m, 10) - 1]} ${y}`;
}

function useShimmer() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.6, 0.3],
  });
}

function Skeleton({ style, shimmer }: { style: any; shimmer: Animated.AnimatedInterpolation<number> }) {
  return <Animated.View style={[style, { opacity: shimmer }]} />;
}

interface Props {
  visible: boolean;
  showTitle: string;
  season: number;
  episode: number;
  episodeTitle: string | null;
  overview: string | null;
  stillPath: string | null;
  airDate: string | null;
  runtime: number | null;
  loadingDetails?: boolean;
  markingWatched?: boolean;
  onMarkWatched?: () => void;
  onShowPress?: () => void;
  onClose: () => void;
}

export default function EpisodeDetailModal({
  visible,
  showTitle,
  season,
  episode,
  episodeTitle,
  overview,
  stillPath,
  airDate,
  runtime,
  loadingDetails,
  markingWatched,
  onMarkWatched,
  onShowPress,
  onClose,
}: Props) {
  const label = `S${String(season).padStart(2, "0")} | E${String(episode).padStart(2, "0")}`;
  const shimmer = useShimmer();

  return (
    <AnimatedModal visible={visible} onClose={onClose}>
      <View style={styles.content}>
        {loadingDetails ? (
          <Skeleton style={styles.stillSkeleton} shimmer={shimmer} />
        ) : stillPath ? (
          <Image
            source={{ uri: `${TMDB_IMAGE_BASE}/w500${stillPath}` }}
            style={styles.still}
            contentFit="cover"
          />
        ) : (
          <View style={styles.stillPlaceholder}>
            <Text style={styles.stillPlaceholderText}>
              E{String(episode).padStart(2, "0")}
            </Text>
          </View>
        )}
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Show name pill */}
          <TouchableOpacity style={styles.titlePill} onPress={onShowPress} disabled={!onShowPress}>
            <Text style={styles.titlePillText} numberOfLines={1}>
              {showTitle.toUpperCase()}
            </Text>
            {onShowPress && <Text style={styles.titlePillArrowText}>›</Text>}
          </TouchableOpacity>

          {episodeTitle ? (
            <Text style={styles.episodeTitle}>{episodeTitle}</Text>
          ) : null}

          <Text style={styles.label}>{label}</Text>

          {/* Meta */}
          <View style={styles.metaRow}>
            {airDate ? <Text style={styles.meta}>{formatDate(airDate)}</Text> : null}
            {runtime ? (
              <Text style={styles.meta}>
                {airDate ? " · " : ""}{runtime} min
              </Text>
            ) : null}
          </View>

          {/* Description */}
          {loadingDetails ? (
            <View style={styles.overviewSkeletonWrap}>
              <Skeleton style={styles.overviewSkeletonLine} shimmer={shimmer} />
              <Skeleton style={styles.overviewSkeletonLineShort} shimmer={shimmer} />
              <Skeleton style={styles.overviewSkeletonLine} shimmer={shimmer} />
            </View>
          ) : overview ? (
            <Text style={styles.overview}>{overview}</Text>
          ) : null}
        </ScrollView>
        {onMarkWatched && (
          <TouchableOpacity
            style={[styles.watchButton, markingWatched && { opacity: 0.6 }]}
            onPress={onMarkWatched}
            disabled={markingWatched}
          >
            {markingWatched ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Text style={styles.watchButtonText}>Mark as Watched</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </AnimatedModal>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: "hidden",
    maxHeight: Dimensions.get("window").height * 0.8,
  },
  still: {
    width: "100%",
    height: 160,
  },
  stillSkeleton: {
    width: "100%",
    height: 160,
    backgroundColor: colors.border,
  },
  stillPlaceholder: {
    width: "100%",
    height: 160,
    backgroundColor: colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  stillPlaceholderText: {
    fontSize: 40,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 2,
  },
  scroll: {
    flexGrow: 1,
    flexShrink: 1,
    padding: spacing.lg,
  },
  titlePill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1.5,
    borderColor: colors.text,
    borderRadius: 14,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginBottom: spacing.sm,
  },
  titlePillText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.text,
    flexShrink: 1,
    letterSpacing: 0.5,
  },
  titlePillArrowText: {
    fontSize: 14,
    color: colors.text,
    marginLeft: spacing.xs,
  },
  label: {
    ...typography.subtitle,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 1,
  },
  episodeTitle: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.xs,
    fontSize: 18,
  },
  metaRow: {
    flexDirection: "row",
    marginTop: spacing.md,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  overviewSkeletonWrap: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  overviewSkeletonLine: {
    height: 12,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  overviewSkeletonLineShort: {
    height: 12,
    width: "70%",
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  overview: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
    lineHeight: 20,
    fontSize: 13,
  },
  watchButton: {
    backgroundColor: colors.watchedGreen,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: 8,
    alignItems: "center",
  },
  watchButtonText: {
    ...typography.subtitle,
    fontSize: 14,
    color: colors.text,
  },
});
