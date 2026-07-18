import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import AnimatedModal from "./AnimatedModal";
import { colors, spacing, typography } from "../../theme";

interface Props {
  visible: boolean;
  title: string;
  hint?: string;
  error?: string | null;
  confirmLabel?: string;
  confirmColor?: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmModal({
  visible,
  title,
  hint,
  error,
  confirmLabel = "Confirm",
  confirmColor,
  loading = false,
  onConfirm,
  onClose,
}: Props) {
  return (
    <AnimatedModal
      visible={visible}
      onClose={() => {
        if (!loading) onClose();
      }}
    >
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TouchableOpacity
          style={[
            styles.confirmButton,
            confirmColor && { backgroundColor: confirmColor },
            loading && { opacity: 0.6 },
          ]}
          onPress={onConfirm}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          )}
        </TouchableOpacity>
        {!loading && (
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </AnimatedModal>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
  },
  title: {
    ...typography.subtitle,
    fontSize: 16,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  error: {
    ...typography.caption,
    color: colors.destructiveRed,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  confirmButton: {
    backgroundColor: colors.destructiveRed,
    paddingVertical: spacing.md,
    borderRadius: 8,
    alignItems: "center",
  },
  confirmText: {
    ...typography.subtitle,
    fontSize: 14,
    color: colors.text,
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  cancelText: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
