import React, {
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
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
  persistAfterSwipe?: boolean | { left: boolean; right: boolean };
  leftLabel?: string;
  rightLabel?: string;
  leftColor?: string;
  rightColor?: string;
}

export default forwardRef<SwipeableCardRef, Props>(function SwipeableCard(
  {
    children,
    onSwipeLeft,
    onSwipeRight,
    height = 100,
    persistAfterSwipe = false,
    leftLabel = "Watched",
    rightLabel = "Stop",
    leftColor = colors.watchedGreen,
    rightColor = colors.stopBlue,
  },
  ref,
) {
  const translateX = useSharedValue(0);
  const [swipeState, setSwipeState] = React.useState<SwipeState>("idle");
  const [showReveal, setShowReveal] = React.useState(false);
  const [actionColor, setActionColor] = React.useState<string>(
    colors.watchedGreen,
  );
  const isProcessing = useRef(false);
  const [persistingLoad, setPersistingLoad] = React.useState(false);
  const onSwipeLeftRef = useRef(onSwipeLeft);
  onSwipeLeftRef.current = onSwipeLeft;
  const onSwipeRightRef = useRef(onSwipeRight);
  onSwipeRightRef.current = onSwipeRight;
  const persistRef = useRef(persistAfterSwipe);
  persistRef.current = persistAfterSwipe;
  const leftColorRef = useRef(leftColor);
  leftColorRef.current = leftColor;
  const rightColorRef = useRef(rightColor);
  rightColorRef.current = rightColor;

  const handleSwipeComplete = useCallback(
    async (direction: "left" | "right") => {
      if (isProcessing.current) return;
      isProcessing.current = true;

      const persist = persistRef.current;
      const shouldPersist =
        typeof persist === "object" ? persist[direction] : !!persist;

      if (shouldPersist) {
        // Keep card off-screen, show colored reveal underneath while loading
        const color =
          direction === "left" ? leftColorRef.current : rightColorRef.current;
        setActionColor(color);
        setPersistingLoad(true);
        setSwipeState("loading");
        try {
          if (direction === "left") {
            await onSwipeLeftRef.current();
          } else {
            await onSwipeRightRef.current();
          }
        } catch (err) {
          console.error("SwipeableCard action failed:", err);
        }
        // Reset silently without animation — list re-render handles the update
        translateX.value = 0;
        setPersistingLoad(false);
        setShowReveal(false);
        setSwipeState("idle");
        isProcessing.current = false;
        return;
      }

      const color =
        direction === "left" ? leftColorRef.current : rightColorRef.current;
      setActionColor(color);
      setSwipeState("loading");

      try {
        if (direction === "left") {
          await onSwipeLeftRef.current();
        } else {
          await onSwipeRightRef.current();
        }
        setSwipeState("done");
        LayoutAnimation.configureNext(
          LayoutAnimation.create(300, "easeInEaseOut", "opacity"),
        );
      } catch (err) {
        console.error("SwipeableCard action failed:", err);
        translateX.value = withTiming(0, { duration: 300 });
        setSwipeState("idle");
        setShowReveal(false);
        isProcessing.current = false;
      }
    },
    [translateX],
  );

  useImperativeHandle(
    ref,
    () => ({
      triggerSwipeLeft: () => {
        if (swipeState !== "idle" || isProcessing.current) return;
        setShowReveal(true);
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 300 }, () => {
          runOnJS(handleSwipeComplete)("left");
        });
      },
    }),
    [swipeState, handleSwipeComplete, translateX],
  );

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onStart(() => {
      runOnJS(setShowReveal)(true);
    })
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
        runOnJS(setShowReveal)(false);
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
      Extrapolation.CLAMP,
    ),
  }));

  const rightRevealOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-SWIPE_THRESHOLD, 0],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  if (swipeState === "done") {
    return null;
  }

  if (swipeState === "loading" && !persistingLoad) {
    return (
      <View
        style={[styles.revealCard, { height, backgroundColor: actionColor }]}
      >
        <ActivityIndicator color={colors.text} />
        <Text style={styles.revealText}>
          {actionColor === leftColor ? leftLabel : rightLabel}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ height, overflow: "hidden" }}>
      {showReveal && (
        <>
          <Animated.View
            style={[
              styles.revealCard,
              styles.revealLeft,
              { height, backgroundColor: leftColor },
              swipeState === "loading" && actionColor === leftColor
                ? { opacity: 1 }
                : leftRevealOpacity,
            ]}
          >
            {swipeState === "loading" && actionColor === leftColor ? (
              <>
                <ActivityIndicator color={colors.text} />
                <Text style={styles.revealText}>{leftLabel}</Text>
              </>
            ) : (
              <>
                <View style={styles.revealIcon}>
                  <Text style={styles.revealIconText}>✓</Text>
                </View>
                <Text style={styles.revealText}>{leftLabel}</Text>
              </>
            )}
          </Animated.View>

          <Animated.View
            style={[
              styles.revealCard,
              styles.revealRight,
              { height, backgroundColor: rightColor },
              swipeState === "loading" && actionColor === rightColor
                ? { opacity: 1 }
                : rightRevealOpacity,
            ]}
          >
            {swipeState === "loading" && actionColor === rightColor ? (
              <>
                <ActivityIndicator color={colors.text} />
                <Text style={styles.revealText}>{rightLabel}</Text>
              </>
            ) : (
              <>
                <Text style={styles.revealText}>{rightLabel}</Text>
                <View style={styles.revealIcon}>
                  <Text style={styles.revealIconText}>✕</Text>
                </View>
              </>
            )}
          </Animated.View>
        </>
      )}

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
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    zIndex: 0,
  },
  revealLeft: {
    justifyContent: "flex-start",
  },
  revealRight: {
    justifyContent: "flex-end",
  },
  revealIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.text,
    justifyContent: "center",
    alignItems: "center",
  },
  revealIconText: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  revealText: {
    ...typography.subtitle,
    color: colors.text,
  },
});
