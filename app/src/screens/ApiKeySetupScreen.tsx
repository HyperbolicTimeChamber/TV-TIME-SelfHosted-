import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useAuthStore } from "../stores/authStore";
import { validateApiKey } from "../services/tmdb";
import { colors, spacing, typography } from "../theme";

export default function ApiKeySetupScreen() {
  const user = useAuthStore((s) => s.user);
  const saveTmdbApiKey = useAuthStore((s) => s.saveTmdbApiKey);
  const [apiKey, setApiKey] = useState("");
  const [validating, setValidating] = useState(false);

  const handleSubmit = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed || !user) return;

    setValidating(true);
    try {
      const valid = await validateApiKey(trimmed);
      if (!valid) {
        Alert.alert("Invalid API Key", "Could not validate this key with TMDB. Check it and try again.");
        return;
      }
      await saveTmdbApiKey(user.uid, trimmed);
    } catch (error) {
      Alert.alert("Error", "Failed to save API key. Please try again.");
    } finally {
      setValidating(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>TMDB API Key</Text>
        <Text style={styles.description}>
          This app uses The Movie Database (TMDB) to fetch show and movie data.
          You need a free API key to continue.
        </Text>

        <TouchableOpacity
          onPress={() => Linking.openURL("https://www.themoviedb.org/settings/api")}
        >
          <Text style={styles.link}>Get your free API key from TMDB</Text>
        </TouchableOpacity>

        <Text style={styles.label}>API Key (v3 auth)</Text>
        <TextInput
          style={styles.input}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="Enter your TMDB API key"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!validating}
        />

        <TouchableOpacity
          style={[styles.button, (!apiKey.trim() || validating) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!apiKey.trim() || validating}
        >
          {validating ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.buttonText}>Save & Continue</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  title: {
    ...typography.title,
    fontSize: 28,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  link: {
    ...typography.body,
    color: colors.accent,
    textAlign: "center",
    textDecorationLine: "underline",
    marginBottom: spacing.xxl,
  },
  label: {
    ...typography.subtitle,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.subtitle,
    color: colors.text,
  },
});
