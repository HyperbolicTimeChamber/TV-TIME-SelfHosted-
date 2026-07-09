import React, { useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import {
  Gesture,
  GestureDetector,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { colors, spacing, typography } from "../theme";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.35;

type SwipeState = "idle" | "swiped_left" | "swiped_right" | "loading" | "done";

export interface SwipeableCardRef {
  triggerSwipeLeft: () => void;
}

interface Props {
  children: React.ReactNode;
  onSwipeLeft: () => Promise<void>;
  onSwipeRight: () => Promise<void>;
  height?: number;
  persistAfterSwipe?: boolean;
}

export default forwardRef<SwipeableCardRef, Props>(function SwipeableCard(
  { children, onSwipeLeft, onSwipeRight, height = 100, persistAfterSwipe = false },
  ref
) {
  const translateX = useSharedValue(0);
  const [swipeState, setSwipeState] = React.useState<SwipeState>("idle");
  const [actionColor, setActionColor] = React.useState<string>(colors.watchedGreen);
  const isProcessing = useRef(false);

  const handleSwipeComplete = useCallback(
    async (direction: "left" | "right") => {
      if (isProcessing.current) return;
      isProcessing.current = true;

      const color =
        direction === "left" ? colors.watchedGreen : colors.stopBlue;
      setActionColor(color);
      setSwipeState("loading");

      try {
        if (direction === "left") {
          await onSwipeLeft();
        } else {
          await onSwipeRight();
        }
        if (persistAfterSwipe) {
          translateX.value = withTiming(0, { duration: 300 });
          setSwipeState("idle");
          isProcessing.current = false;
        } else {
          setSwipeState("done");
          LayoutAnimation.configureNext(
            LayoutAnimation.create(300, "easeInEaseOut", "opacity")
          );
        }
      } catch {
        translateX.value = withTiming(0, { duration: 300 });
        setSwipeState("idle");
        isProcessing.current = false;
      }
    },
    [onSwipeLeft, onSwipeRight, translateX]
  );

  useImperativeHandle(ref, () => ({
    triggerSwipeLeft: () => {
      if (swipeState !== "idle" || isProcessing.current) return;
      translateX.value = withTiming(SCREEN_WIDTH, { duration: 300 }, () => {
        runOnJS(handleSwipeComplete)("left");
      });
    },
  }), [swipeState, handleSwipeComplete, translateX]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((event) => {
      if (swipeState !== "idle") return;
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      if (swipeState !== "idle") return;

      if (event.translationX > SWIPE_THRESHOLD) {
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 200 }, () => {
          runOnJS(handleSwipeComplete)("left");
        });
      } else if (event.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SCREEN_WIDTH, { duration: 200 }, () => {
          runOnJS(handleSwipeComplete)("right");
        });
      } else {
        translateX.value = withTiming(0, { duration: 200 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const leftRevealOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  const rightRevealOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  if (swipeState === "done") {
    return null;
  }

  if (swipeState === "loading") {
    return (
      <View style={[styles.revealCard, { height, backgroundColor: actionColor }]}>
        <ActivityIndicator color={colors.text} />
        <Text style={styles.revealText}>
          {actionColor === colors.watchedGreen ? "Watched" : "Stop Watching"}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ height, overflow: "hidden" }}>
      <Animated.View
        style={[
          styles.revealCard,
          { height, backgroundColor: colors.watchedGreen },
          leftRevealOpacity,
        ]}
      >
        <Text style={styles.revealText}>✓ Watched</Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.revealCard,
          { height, backgroundColor: colors.stopBlue },
          rightRevealOpacity,
        ]}
      >
        <Text style={styles.revealText}>Stop Watching</Text>
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.card, { height }, cardStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    zIndex: 1,
  },
  revealCard: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    zIndex: 0,
  },
  revealText: {
    ...typography.subtitle,
    color: colors.text,
  },
});
