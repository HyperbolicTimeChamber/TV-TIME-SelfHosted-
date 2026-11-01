import React, { useEffect, useRef, useState, type ReactNode } from "react";
import {
	View,
	Text,
	TextInput,
	TouchableOpacity,
	ActivityIndicator,
	StyleSheet,
} from "react-native";
import AnimatedModal from "./AnimatedModal";
import { CUSTOM_LIST_NAME_MAX } from "../../enums";
import { colors, spacing, typography } from "../../theme";

interface Props {
	visible: boolean;
	/** "New List" / "Rename List" */
	title: string;
	/** Text the field starts with (rename) */
	initialName?: string;
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
}

const pickHint = (hint: Props["hint"]) =>
	typeof hint === "string" || hint === undefined
		? hint
		: hint[Math.floor(Math.random() * hint.length)];

/** One text field + confirm / cancel, in the app's popup look (ConfirmModal's shape) */
export default function ListNameModal({
	visible,
	title,
	initialName = "",
	confirmLabel = "Save",
	error,
	loading = false,
	onSubmit,
	onClose,
	image,
	hint,
}: Props) {
	const [name, setName] = useState(initialName);
	const [shownHint, setShownHint] = useState(() => pickHint(hint));
	const inputRef = useRef<TextInput>(null);
	useEffect(() => {
		if (visible) setName(initialName);
	}, [visible, initialName]);
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

	const blank = name.trim().length === 0;
	const submit = () => {
		if (!blank && !loading) onSubmit(name);
	};

	return (
		<AnimatedModal
			visible={visible}
			onClose={() => {
				if (!loading) onClose();
			}}
		>
			<View style={styles.content}>
				<Text style={[styles.title, image != null && styles.titleOverImage]}>{title}</Text>
				{image != null && <View style={styles.image}>{image}</View>}
				{shownHint ? <Text style={styles.hint}>{shownHint}</Text> : null}
				<TextInput
					ref={inputRef}
					style={styles.input}
					value={name}
					onChangeText={setName}
					placeholder="List name"
					placeholderTextColor={colors.textMuted}
					maxLength={CUSTOM_LIST_NAME_MAX}
					// Rename: the old name is selected, so typing replaces it
					selectTextOnFocus={initialName.length > 0}
					returnKeyType="done"
					onSubmitEditing={submit}
					selectionColor={colors.primary}
				/>
				{error ? <Text style={styles.error}>{error}</Text> : null}
				<TouchableOpacity
					style={[styles.button, (blank || loading) && { opacity: 0.5 }]}
					onPress={submit}
					disabled={blank || loading}
				>
					{loading ? (
						<ActivityIndicator size="small" color={colors.text} />
					) : (
						<Text style={styles.buttonText}>{confirmLabel}</Text>
					)}
				</TouchableOpacity>
				{!loading && (
					<TouchableOpacity style={styles.cancelButton} onPress={onClose}>
						<Text style={styles.buttonText}>Cancel</Text>
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
		marginBottom: spacing.md,
	},
	// ConfirmModal's spacing: the title's gap above the art matches the art's gap below
	titleOverImage: { marginBottom: spacing.sm },
	image: { alignItems: "center", marginBottom: spacing.sm },
	hint: {
		...typography.caption,
		color: colors.textSecondary,
		textAlign: "center",
		marginBottom: spacing.md,
	},
	input: {
		...typography.body,
		backgroundColor: colors.surfaceLight,
		borderRadius: 8,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
		marginBottom: spacing.md,
	},
	error: {
		...typography.caption,
		color: colors.destructiveRed,
		textAlign: "center",
		marginBottom: spacing.md,
	},
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
		marginTop: spacing.sm,
	},
});
