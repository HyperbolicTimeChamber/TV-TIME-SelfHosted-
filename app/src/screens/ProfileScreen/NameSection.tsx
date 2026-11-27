import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Keyboard } from "react-native";
import { colors, spacing, typography, themedStyles } from "../../theme";
import { DISPLAY_NAME_MAX } from "../../enums";
import { useAuthStore } from "../../stores";
import { useLocalProfile, useLocalProfileStore } from "../../stores/localProfileStore";
import { cleanDisplayName, displayNameOf } from "../../utils/localProfile";

/** Settings -> Profile -> Name: what the profile calls you, kept on this device */
export default function NameSection() {
	const user = useAuthStore((s) => s.user);
	const local = useLocalProfile(user?.uid);
	const shown = displayNameOf(local, user?.displayName);
	// What is typed; null = untouched, so the box shows the current name
	const [draft, setDraft] = useState<string | null>(null);
	const typed = draft === null ? null : cleanDisplayName(draft);
	const changed = draft !== null && typed !== null && typed !== shown;

	const keep = (name: string | null) => {
		if (!user) return;
		useLocalProfileStore.getState().save(user.uid, { name });
		setDraft(null);
		Keyboard.dismiss();
	};

	return (
		<View style={styles.section}>
			<Text style={styles.sectionTitle}>Name</Text>
			<View style={styles.body}>
				<View style={styles.inputRow}>
					<TextInput
						style={styles.input}
						value={draft ?? shown}
						onChangeText={setDraft}
						maxLength={DISPLAY_NAME_MAX}
						placeholder="Your name"
						placeholderTextColor={colors.textMuted}
						selectionColor={colors.primary}
						returnKeyType="done"
						onSubmitEditing={() => changed && keep(typed)}
						accessibilityLabel="Your name"
					/>
					<TouchableOpacity
						style={[styles.save, !changed && styles.saveOff]}
						disabled={!changed}
						onPress={() => keep(typed)}
						accessibilityRole="button"
						accessibilityLabel="Save name"
					>
						<Text style={styles.saveText}>Save</Text>
					</TouchableOpacity>
				</View>
				<Text style={styles.hint}>Saved on this device only.</Text>
				{local.name && (
					<TouchableOpacity onPress={() => keep(null)} hitSlop={8} accessibilityRole="button">
						<Text style={styles.reset}>Use account name</Text>
					</TouchableOpacity>
				)}
			</View>
		</View>
	);
}

const styles = themedStyles(() =>
	StyleSheet.create({
		section: {
			marginTop: spacing.lg,
			marginHorizontal: spacing.lg,
			backgroundColor: colors.surface,
			borderRadius: 8,
			overflow: "hidden",
		},
		sectionTitle: {
			...typography.caption,
			color: colors.textMuted,
			paddingHorizontal: spacing.md,
			paddingTop: spacing.md,
			paddingBottom: spacing.xs,
		},
		body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
		inputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
		input: {
			...typography.subtitle,
			fontSize: 15,
			flex: 1,
			color: colors.text,
			backgroundColor: colors.border,
			borderRadius: 8,
			paddingVertical: spacing.sm,
			paddingHorizontal: spacing.md,
		},
		save: {
			height: 40,
			paddingHorizontal: spacing.lg,
			borderRadius: 20,
			justifyContent: "center",
			backgroundColor: colors.primary,
		},
		saveOff: { opacity: 0.4 },
		saveText: { ...typography.subtitle, fontSize: 15, color: colors.onPrimary },
		hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
		reset: { ...typography.caption, color: colors.accent, marginTop: spacing.md },
	}),
);
