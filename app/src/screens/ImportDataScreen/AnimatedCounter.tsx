import React, { useState, useEffect, useRef } from "react";
import { View, Text } from "react-native";
import { spacing } from "../../theme";
import { importStyles as styles } from "./styles";

interface Props {
  target: number;
  total: number;
}

export default function AnimatedCounter({ target, total }: Props) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startRef = useRef({ value: 0, time: 0 });
  const prevTotalRef = useRef(total);

  // Reset when total changes (new phase)
  useEffect(() => {
    if (total !== prevTotalRef.current) {
      prevTotalRef.current = total;
      setDisplay(0);
    }
  }, [total]);

  useEffect(() => {
    if (target === display) return;
    const from = display;
    const duration = Math.min(900, Math.max(300, (target - from) * 20));
    startRef.current = { value: from, time: Date.now() };

    const tick = () => {
      const elapsed = Date.now() - startRef.current.time;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (target - from) * eased);
      setDisplay(current);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target]);

  const pct = total > 0 ? (display / total) * 100 : 0;

  return (
    <>
      <View style={[styles.progressBar, { marginTop: spacing.lg }]}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.progressText}>
        {display} / {total}
      </Text>
    </>
  );
}
