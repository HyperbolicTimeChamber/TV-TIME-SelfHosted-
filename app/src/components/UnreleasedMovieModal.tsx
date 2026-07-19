import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  getFirestore,
  doc,
  updateDoc,
  getDoc,
} from "@react-native-firebase/firestore";
import { AnimatedModal } from "./modals";
import { colors, spacing, typography } from "../theme";
import { useAuthStore } from "../stores";

const STORAGE_KEY = "hideUnreleasedMovieModal";

interface Props {
  visible: boolean;
  onClose: () => void;
  movieTitle: string;
}

export function UnreleasedMovieModal({ visible, onClose, movieTitle }: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const user = useAuthStore((s) => s.user);

  const handleOk = async () => {
    if (dontShowAgain && user?.uid) {
      await AsyncStorage.setItem(STORAGE_KEY, "true");
      const db = getFirestore();
      updateDoc(doc(db, "users", user.uid), {
        hideUnreleasedMovieModal: true,
      }).catch(() => {});
    }
    onClose();
  };

  return (
    <AnimatedModal visible={visible} onClose={onClose}>
      <View style={styles.content}>
        <Text style={styles.title}>Added to Watchlist</Text>
        <Text style={styles.body}>
          {movieTitle} hasn't released yet. It will appear on your watchlist
          when it airs. Check the Upcoming or Calendar tab to confirm.
        </Text>
        <TouchableOpacity
          style={styles.checkbox}
          onPress={() => setDontShowAgain(!dontShowAgain)}
        >
          <View style={[styles.box, dontShowAgain && styles.boxChecked]}>
            {dontShowAgain && <Text style={styles.check}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>Don't show this again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleOk}>
          <Text style={styles.buttonText}>OK</Text>
        </TouchableOpacity>
      </View>
    </AnimatedModal>
  );
}

/**
 * Check if the unreleased movie modal should be shown.
 * Reads from AsyncStorage first (cache), falls back to Firestore.
 */
export async function shouldShowUnreleasedModal(
  userId: string,
): Promise<boolean> {
  // Check cache first
  const cached = await AsyncStorage.getItem(STORAGE_KEY);
  if (cached === "true") return false;

  // Fallback to Firestore
  try {
    const db = getFirestore();
    const userDoc = await getDoc(doc(db, "users", userId));
    const hide = userDoc.data()?.hideUnreleasedMovieModal === true;
    if (hide) {
      await AsyncStorage.setItem(STORAGE_KEY, "true");
      return false;
    }
  } catch {}

  return true;
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.xl,
    alignItems: "center",
    marginHorizontal: spacing.lg,
  },
  title: {
    ...typography.title,
    marginBottom: spacing.md,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  checkbox: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xl,
    alignSelf: "flex-start",
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  boxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  check: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  checkLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: 8,
  },
  buttonText: {
    ...typography.subtitle,
    color: colors.text,
  },
});
