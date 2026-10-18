import React, { type ReactNode } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import AnimatedModal from "./AnimatedModal";
import { colors, spacing, typography } from "../../theme";

interface Props {
	visible: boolean;
	title: string;
	/** Art between the title and the hint (see ModalArt: logo, poster, character art) */
	image?: ReactNode;
	hint?: string;
	error?: string | null;
	confirmLabel?: string;
	confirmColor?: string;
	/** Spinner in the confirm button; the other buttons are locked while it runs */
	loading?: boolean;
	onConfirm: () => void;
	/** Optional second choice under the confirm button (e.g. "Just This One") */
	secondaryLabel?: string;
	secondaryColor?: string;
	onSecondary?: () => void;
	cancelLabel?: string;
	/** No Cancel button (tapping outside still closes) */
	hideCancel?: boolean;
	onClose: () => void;
}

/** Every confirm / choice popup: title, image, hint, one or two actions, outlined Cancel */
export default function ConfirmModal({
	visible,
	title,
	image,
	hint,
	error,
	confirmLabel = "Confirm",
	confirmColor,
	loading = false,
	onConfirm,
	secondaryLabel,
	secondaryColor,
	onSecondary,
	cancelLabel = "Cancel",
	hideCancel = false,
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
				{image != null && <View style={styles.image}>{image}</View>}
				{hint ? <Text style={styles.hint}>{hint}</Text> : null}
				{error ? <Text style={styles.error}>{error}</Text> : null}
				<TouchableOpacity
					style={[
						styles.button,
						confirmColor && { backgroundColor: confirmColor },
						loading && { opacity: 0.6 },
					]}
					onPress={onConfirm}
					disabled={loading}
				>
					{loading ? (
						<ActivityIndicator size="small" color={colors.text} />
					) : (
						<Text style={styles.buttonText}>{confirmLabel}</Text>
					)}
				</TouchableOpacity>
				{secondaryLabel && onSecondary && (
					<TouchableOpacity
						style={[
							styles.button,
							styles.secondary,
							secondaryColor && { backgroundColor: secondaryColor },
							loading && { opacity: 0.6 },
						]}
						onPress={onSecondary}
						disabled={loading}
					>
						<Text style={styles.buttonText}>{secondaryLabel}</Text>
					</TouchableOpacity>
				)}
				{!loading && !hideCancel && (
					<TouchableOpacity style={styles.cancelButton} onPress={onClose}>
						<Text style={styles.buttonText}>{cancelLabel}</Text>
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
	// Title's marginBottom is the gap above; this matches it below (equal top / bottom)
	image: {
		alignItems: "center",
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
	button: {
		backgroundColor: colors.destructiveRed,
		paddingVertical: spacing.md,
		borderRadius: 8,
		alignItems: "center",
	},
	// Neutral fill so it reads apart from the outlined Cancel
	secondary: {
		backgroundColor: colors.surfaceLight,
		marginTop: spacing.sm,
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
