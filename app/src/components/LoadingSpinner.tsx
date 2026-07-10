import React, { useEffect, useRef } from "react";
import { View, Animated, Easing, StyleSheet } from "react-native";

const SIZE = 48;
const COLOR_1 = "#fff";
const COLOR_2 = "#ff3d00";

const DOTS = [
  { r: 12, cx: 22, cy: 22 },
  { r: 10, cx: 6, cy: 40 },
  { r: 14, cx: 31, cy: -6 },
  { r: 5, cx: 40, cy: 30 },
];

export default function LoadingSpinner() {
  const rotate = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(rotate, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const flix = Animated.loop(
      Animated.sequence([
        Animated.timing(tilt, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.timing(tilt, {
          toValue: 1,
          duration: 900,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(tilt, {
          toValue: 0.3,
          duration: 600,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(tilt, {
          toValue: 1,
          duration: 600,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(tilt, {
          toValue: 0,
          duration: 900,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
      ])
    );

    spin.start();
    flix.start();

    return () => {
      spin.stop();
      flix.stop();
    };
  }, [rotate, tilt]);

  const spinInterpolation = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const tiltInterpolation = tilt.interpolate({
    inputRange: [0, 1],
    outputRange: ["-10deg", "5deg"],
  });

  return (
    <View style={styles.container}>
      <Animated.View style={{ transform: [{ rotate: tiltInterpolation }] }}>
        {/* Hat */}
        <View style={styles.hat} />
        {/* Ball */}
        <Animated.View
          style={[styles.ball, { transform: [{ rotate: spinInterpolation }] }]}
        >
          {DOTS.map((dot, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  width: dot.r * 2,
                  height: dot.r * 2,
                  borderRadius: dot.r,
                  left: dot.cx - dot.r,
                  top: dot.cy - dot.r,
                },
              ]}
            />
          ))}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  ball: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: COLOR_1,
    overflow: "hidden",
  },
  dot: {
    position: "absolute",
    backgroundColor: COLOR_2,
  },
  hat: {
    width: SIZE / 2,
    height: SIZE / 4,
    backgroundColor: COLOR_1,
    borderTopLeftRadius: SIZE,
    borderTopRightRadius: SIZE,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    alignSelf: "center",
    marginBottom: -1,
  },
});
