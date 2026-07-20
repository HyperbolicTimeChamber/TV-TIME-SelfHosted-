import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Animated,
  PanResponder,
  StyleSheet,
  Dimensions,
} from "react-native";
import { colors, spacing, typography } from "../../theme";

export type WatchAction = "rewatch" | "not_watched" | "watched_once_less";

interface Props {
  visible: boolean;
  label: string;
  watchCount: number;
  onSelect: (action: WatchAction) => void;
  onClose: () => void;
}

const SCREEN_HEIGHT = Dimensions.get("window").height;

export default function WatchActionSheet({
  visible,
  label,
  watchCount,
  onSelect,
  onClose,
}: Props) {
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

  const dismiss = () => {
    Animated.timing(translateY, {
      toValue: SCREEN_HEIGHT,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onClose());
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        gs.dy > 8 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || gs.vy > 0.5) {
          dismiss();
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

  const handleSelect = (action: WatchAction) => {
    Animated.timing(translateY, {
      toValue: SCREEN_HEIGHT,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onClose();
      onSelect(action);
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={dismiss}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={dismiss}
      >
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY }] }]}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity activeOpacity={1}>
            <View style={styles.handle} />
            <Text style={styles.title}>{label}</Text>
            <Text style={styles.subtitle}>Watched {watchCount}x</Text>

            <TouchableOpacity
              style={styles.option}
              onPress={() => handleSelect("rewatch")}
            >
              <Text style={styles.optionIcon}>🔄</Text>
              <View style={styles.optionContent}>
                <Text style={styles.optionText}>Rewatch</Text>
                <Text style={styles.optionHint}>Mark as watched again</Text>
              </View>
            </TouchableOpacity>

            {watchCount > 1 && (
              <TouchableOpacity
                style={styles.option}
                onPress={() => handleSelect("watched_once_less")}
              >
                <Text style={styles.optionIcon}>−1</Text>
                <View style={styles.optionContent}>
                  <Text style={styles.optionText}>Watched Once Less</Text>
                  <Text style={styles.optionHint}>
                    Reduce to {watchCount - 1}x
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.option, styles.destructiveOption]}
              onPress={() => handleSelect("not_watched")}
            >
              <Text style={styles.optionIcon}>✕</Text>
              <View style={styles.optionContent}>
                <Text style={[styles.optionText, styles.destructiveText]}>
                  Not Watched
                </Text>
                <Text style={styles.optionHint}>Remove all watch history</Text>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayLight,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34,
    paddingHorizontal: spacing.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.textMuted,
    alignSelf: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  title: {
    ...typography.subtitle,
    fontSize: 16,
    textAlign: "center",
  },
  subtitle: {
    ...typography.caption,
    textAlign: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  optionIcon: {
    fontSize: 18,
    width: 36,
    textAlign: "center",
    color: colors.text,
  },
  optionContent: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  optionText: {
    ...typography.subtitle,
    fontSize: 15,
  },
  optionHint: {
    ...typography.caption,
    fontSize: 12,
    marginTop: 2,
  },
  destructiveOption: {},
  destructiveText: {
    color: colors.destructiveRed,
  },
});
