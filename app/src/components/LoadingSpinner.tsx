import React from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { colors } from "../theme";

interface Props {
  size?: "small" | "large";
  color?: string;
}

export default function LoadingSpinner({
  size = "small",
  color = colors.text,
}: Props) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
});
