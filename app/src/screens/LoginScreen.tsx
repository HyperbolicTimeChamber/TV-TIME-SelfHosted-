import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { colors, spacing, typography } from "../theme";
import { useAuthStore } from "../stores/authStore";

export default function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signIn();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TV Time</Text>
      <Text style={styles.subtitle}>Track your shows & movies</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={handleSignIn}
        disabled={signingIn}
      >
        {signingIn ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.buttonText}>Sign in with Google</Text>
        )}
      </TouchableOpacity>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  title: {
    ...typography.title,
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.caption,
    fontSize: 16,
    marginBottom: spacing.xxl * 2,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    borderRadius: 8,
    minWidth: 250,
    alignItems: "center",
  },
  buttonText: {
    ...typography.subtitle,
    color: colors.text,
  },
  error: {
    ...typography.body,
    color: colors.destructiveRed,
    marginTop: spacing.lg,
  },
});
