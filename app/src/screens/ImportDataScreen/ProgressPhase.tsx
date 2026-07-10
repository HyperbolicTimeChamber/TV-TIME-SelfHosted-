import React from "react";
import { View, Text } from "react-native";
import LoadingSpinner from "../../components/LoadingSpinner";
import AnimatedCounter from "./AnimatedCounter";
import { spacing } from "../../theme";
import { importStyles as styles } from "./styles";

interface Props {
  insetTop: number;
  statusText: string;
  progress: { done: number; total: number };
}

export default function ProgressPhase({ insetTop, statusText, progress }: Props) {
  return (
    <View style={[styles.centered, { paddingTop: insetTop }]}>
      <Text style={styles.title}>{statusText}</Text>
      <View style={{ marginTop: spacing.md }}>
        <LoadingSpinner />
      </View>
      {progress.total > 0 && (
        <AnimatedCounter target={progress.done} total={progress.total} />
      )}
      <Text style={[styles.warning, { marginTop: spacing.xl, marginBottom: 0 }]}>
        Do not close the app during import
      </Text>
    </View>
  );
}
