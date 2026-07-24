import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ImportStats } from "../../services/tvtimeImport";
import { importStyles as styles } from "./styles";

interface Props {
  insetTop: number;
  stats: ImportStats;
  onDone: () => void;
}

export default function DonePhase({ insetTop, stats, onDone }: Props) {
  return (
    <View style={[styles.centered, { paddingTop: insetTop }]}>
      <Text style={styles.title}>Import Complete!</Text>
      <View style={styles.statsBox}>
        <Text style={styles.statLine}>Shows: {stats.showsImported}</Text>
        <Text style={styles.statLine}>Movies: {stats.moviesImported}</Text>
        <Text style={styles.statLine}>Episodes: {stats.episodesImported}</Text>
        {stats.minutesImported > 0 && (
          <Text style={styles.statLine}>
            Watch time: {Math.round(stats.minutesImported / 60)}h{" "}
            {stats.minutesImported % 60}m
          </Text>
        )}
        {stats.skipped > 0 && (
          <Text style={styles.statLine}>
            Skipped (already existed): {stats.skipped}
          </Text>
        )}
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={onDone}>
        <Text style={styles.buttonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}
