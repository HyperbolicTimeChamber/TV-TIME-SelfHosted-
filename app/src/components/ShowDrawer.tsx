import { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Animated,
  PanResponder,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import SkeletonLine from "./SkeletonLine";
import { colors, spacing, typography, posterSize } from "../theme";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const DISMISS_THRESHOLD = 120;

export interface ShowDrawerData {
  tmdbId?: number;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  mediaType?: "tv" | "movie" | string;
  year?: string | null;
  totalSeasons?: number | null;
  totalEpisodes?: number | null;
  runtime?: number | null;
  status?: string | null;
  genres?: string | null;
  voteAverage?: number | null;
}

interface Props {
  visible: boolean;
  show: ShowDrawerData | null;
  loading?: boolean;
  onGoToShow?: () => void;
  onClose: () => void;
}

export default function ShowDrawer({ visible, show, loading, onGoToShow, onClose }: Props) {
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        damping: 20,
        stiffness: 200,
        useNativeDriver: true,
      }).start();
    } else {
      translateY.setValue(SCREEN_HEIGHT);
    }
  }, [visible, translateY]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleClose = () => {
    Animated.timing(translateY, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onCloseRef.current());
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_THRESHOLD || g.vy > 0.5) {
          Animated.timing(translateY, {
            toValue: SCREEN_HEIGHT,
            duration: 250,
            useNativeDriver: true,
          }).start(() => onCloseRef.current());
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            damping: 20,
            stiffness: 200,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  if (!show && !loading) return null;

  const metaParts: string[] = [];
  if (show?.year) metaParts.push(show.year);
  if (show?.totalSeasons) metaParts.push(`${show.totalSeasons} season${show.totalSeasons !== 1 ? "s" : ""}`);
  if (show?.totalEpisodes) metaParts.push(`${show.totalEpisodes} episodes`);
  if (show?.runtime) metaParts.push(`${show.runtime} min`);
  const metaLine = metaParts.join(" \u00b7 ");

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.overlayTouch} activeOpacity={1} onPress={handleClose} />
        <Animated.View
          style={[styles.drawer, { transform: [{ translateY }] }]}
        >
          {loading ? (
            <>
              <View {...panResponder.panHandlers} style={styles.handleAreaStatic}>
                <View style={styles.handle} />
              </View>
              <ActivityIndicator
                size="large"
                color={colors.primary}
                style={{ marginVertical: spacing.xxl }}
              />
            </>
          ) : show ? (
            <>
              <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                <View>
                  <Image
                    source={{ uri: `${posterSize.large}${show.backdropPath || show.posterPath}` }}
                    style={styles.backdrop}
                    contentFit="cover"
                  />
                  <View {...panResponder.panHandlers} style={styles.handleArea} pointerEvents="box-only">
                    <View style={styles.handle} />
                  </View>
                </View>
                <View style={styles.content}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title}>{show.title}</Text>
                    {show.mediaType && (
                      <View style={[
                        styles.typeBadge,
                        show.mediaType === "movie" && styles.typeBadgeMovie,
                      ]}>
                        <Text style={styles.typeBadgeText}>
                          {show.mediaType === "movie" ? "MOVIE" : "TV"}
                        </Text>
                      </View>
                    )}
                  </View>
                  {metaLine ? <Text style={styles.meta}>{metaLine}</Text> : null}
                  {show.genres ? (
                    <Text style={styles.meta}>{show.genres}</Text>
                  ) : (
                    <SkeletonLine width="45%" height={11} style={{ marginTop: spacing.xs }} />
                  )}
                  {show.overview ? (
                    <Text style={styles.overview}>{show.overview}</Text>
                  ) : null}
                </View>
              </ScrollView>
              {onGoToShow && (
                <TouchableOpacity style={styles.goToShowButton} onPress={onGoToShow}>
                  <Text style={styles.goToShowText}>
                    {show.mediaType === "movie" ? "Go to Movie" : "Go to Show"}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayMedium,
    justifyContent: "flex-end",
  },
  overlayTouch: {
    flex: 1,
  },
  drawer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: SCREEN_HEIGHT * 0.85,
    paddingBottom: spacing.xl,
  },
  handleArea: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: spacing.sm,
    alignItems: "center",
    zIndex: 1,
  },
  handleAreaStatic: {
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
  },
  scroll: {
    flexGrow: 0,
  },
  backdrop: {
    width: "100%",
    height: 200,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  content: {
    padding: spacing.lg,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    ...typography.title,
    fontSize: 22,
    flex: 1,
  },
  typeBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    flexShrink: 0,
  },
  typeBadgeMovie: {
    backgroundColor: colors.moviePurple,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: 0.5,
  },
  meta: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  overview: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
    lineHeight: 22,
  },
  goToShowButton: {
    alignItems: "center",
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  goToShowText: {
    ...typography.subtitle,
    fontSize: 14,
    color: colors.text,
  },
  closeButton: {
    alignItems: "center",
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    borderRadius: 8,
    backgroundColor: colors.surfaceLight,
  },
  closeText: {
    ...typography.subtitle,
    fontSize: 14,
    color: colors.textSecondary,
  },
});
