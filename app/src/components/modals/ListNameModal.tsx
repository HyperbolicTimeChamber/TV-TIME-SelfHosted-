import React, { useEffect, useRef, useState, type ReactNode } from "react";
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	ActivityIndicator,
	StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AnimatedModal from "./AnimatedModal";
import { CUSTOM_LIST_NAME_MAX } from "../../enums";
import { colors, spacing, typography } from "../../theme";

interface Props {
	visible: boolean;
	/** "New List" / "Rename List" */
	title: string;
	/** Text the field starts with (rename) */
	initialName?: string;
	/** Text the field starts with when creating (a list searched for that doesn't exist yet):
	 *  submittable as is, cursor at its end — unlike initialName, the rename's old name */
	suggestedName?: string;
	confirmLabel?: string;
	/** Why the last try was refused (name taken, write failed…) */
	error?: string | null;
	loading?: boolean;
	onSubmit: (name: string) => void;
	onClose: () => void;
	/** Art between the title and the hint (ModalArt), as in ConfirmModal */
	image?: ReactNode;
	/** Line under the art; a list → one of them, picked each time the popup opens */
	hint?: string | readonly string[];
	/** Fixed line right under the title (create only) */
	subtitle?: string;
}

/** Past this many characters the field shows how many are left */
const COUNTER_FROM = Math.floor(CUSTOM_LIST_NAME_MAX * 0.8);

/** The selected old name (rename): a translucent red, not the solid brand colour */
const SELECTION = `${colors.primary}66`;

const pickHint = (hint: Props["hint"]) =>
	typeof hint === "string" || hint === undefined
		? hint
		: hint[Math.floor(Math.random() * hint.length)];

/** One text field + confirm / cancel, in the app's popup look (ConfirmModal's shape) */
export default function ListNameModal({
	visible,
	title,
	initialName = "",
	suggestedName = "",
	confirmLabel = "Save",
	error,
	loading = false,
	onSubmit,
	onClose,
	image,
	hint,
	subtitle,
}: Props) {
	const [name, setName] = useState(initialName || suggestedName);
	const [shownHint, setShownHint] = useState(() => pickHint(hint));
	const inputRef = useRef<TextInput>(null);
	const [focused, setFocused] = useState(false);
	useEffect(() => {
		if (visible) setName(initialName || suggestedName);
	}, [visible, initialName, suggestedName]);
	// A fresh line per opening, not per render (it'd change as the user types)
	useEffect(() => {
		if (visible) setShownHint(pickHint(hint));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [visible]);

	// Keyboard up as soon as the popup is: `autoFocus` inside a Modal is ignored on Android, so focus
	// by hand once the open animation (AnimatedModal's 250ms) has finished and the field takes touches
	useEffect(() => {
		if (!visible) return;
		const t = setTimeout(() => inputRef.current?.focus(), 300);
		return () => clearTimeout(t);
	}, [visible]);

	const showCounter = name.length >= COUNTER_FROM;
	const showUnder = !!error || showCounter;
	const blank = name.trim().length === 0;
	// Rename with the name untouched: nothing to save
	const unchanged = initialName.length > 0 && name.trim() === initialName.trim();
	const disabled = blank || unchanged || loading;
	const submit = () => {
		if (!disabled) onSubmit(name);
	};

	return (
		<AnimatedModal
			visible={visible}
			onClose={() => {
				if (!loading) onClose();
			}}
		>
			<View style={styles.content}>
				<Text style={[styles.title, (image != null || !!subtitle) && styles.titleOverImage]}>{title}</Text>
				{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
				{image != null && <View style={styles.image}>{image}</View>}
				{shownHint ? <Text style={styles.hint}>{shownHint}</Text> : null}
				<View
					style={[
						styles.field,
						// 12 to the buttons — or 4 to the error / count line that sits between them
						{ marginBottom: showUnder ? spacing.xs : spacing.md },
						focused && styles.fieldFocused,
						!!error && styles.fieldError,
					]}
				>
					<TextInput
						ref={inputRef}
						style={styles.input}
						value={name}
						onChangeText={setName}
						onFocus={() => setFocused(true)}
						onBlur={() => setFocused(false)}
						placeholder="List name"
						placeholderTextColor={colors.textMuted}
						maxLength={CUSTOM_LIST_NAME_MAX}
						// Rename: the old name is selected, so typing replaces it (a soft highlight —
						// the brand red read as a solid block behind the text)
						selectTextOnFocus={initialName.length > 0}
						returnKeyType="done"
						onSubmitEditing={submit}
						selectionColor={SELECTION}
						cursorColor={colors.primary}
						accessibilityLabel="List name"
					/>
					{name.length > 0 && !loading && (
						<TouchableOpacity
							onPress={() => {
								setName("");
								inputRef.current?.focus();
							}}
							hitSlop={10}
							accessibilityRole="button"
							accessibilityLabel="Clear name"
						>
							<Ionicons name="close-circle" size={20} color={colors.textMuted} />
						</TouchableOpacity>
					)}
				</View>
				{/* Error and the character count share a line under the field — only when there is one */}
				{showUnder && (
					<View style={styles.under}>
						{error ? <Text style={styles.error}>{error}</Text> : <View style={styles.flex} />}
						{showCounter && (
							<Text style={styles.counter}>
								{name.length}/{CUSTOM_LIST_NAME_MAX}
							</Text>
						)}
					</View>
				)}
				<View style={styles.buttons}>
					{!loading && (
						<TouchableOpacity
							style={[styles.cancelButton, styles.flex]}
							onPress={onClose}
							accessibilityRole="button"
						>
							<Text style={styles.buttonText}>Cancel</Text>
						</TouchableOpacity>
					)}
					<TouchableOpacity
						style={[styles.button, styles.flex, disabled && { opacity: 0.5 }]}
						onPress={submit}
						disabled={disabled}
						accessibilityRole="button"
					>
						{loading ? (
							<ActivityIndicator size="small" color={colors.text} />
						) : (
							<Text style={styles.buttonText}>{confirmLabel}</Text>
						)}
					</TouchableOpacity>
				</View>
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
		marginBottom: spacing.md,
	},
	// ConfirmModal's spacing: the title's gap above the art matches the art's gap below
	titleOverImage: { marginBottom: spacing.sm },
	subtitle: {
		...typography.caption,
		color: colors.textSecondary,
		textAlign: "center",
		marginBottom: spacing.sm,
	},
	image: { alignItems: "center", marginBottom: spacing.sm },
	hint: {
		...typography.caption,
		color: colors.textSecondary,
		textAlign: "center",
		marginBottom: spacing.md,
	},
	field: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		backgroundColor: colors.surfaceLight,
		borderRadius: 8,
		borderWidth: 1.5,
		borderColor: "transparent",
		paddingHorizontal: spacing.md,
	},
	fieldFocused: { borderColor: colors.textSecondary },
	fieldError: { borderColor: colors.destructiveRed },
	input: { ...typography.body, flex: 1, paddingVertical: spacing.md },
	flex: { flex: 1 },
	under: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		marginBottom: spacing.md,
	},
	error: { ...typography.caption, flex: 1, color: colors.destructiveRed },
	counter: { ...typography.caption, color: colors.textSecondary },
	buttons: { flexDirection: "row", gap: spacing.sm },
	button: {
		backgroundColor: colors.primary,
		paddingVertical: spacing.md,
		borderRadius: 8,
		alignItems: "center",
	},
	buttonText: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.text,
	},
	cancelButton: {
		paddingVertical: spacing.md,
		borderRadius: 8,
		alignItems: "center",
		borderWidth: 1.5,
		borderColor: colors.text,
	},
});
