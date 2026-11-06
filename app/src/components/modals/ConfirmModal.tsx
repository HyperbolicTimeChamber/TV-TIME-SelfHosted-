import React, { cloneElement, isValidElement, type ReactNode } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	ActivityIndicator,
	StyleSheet,
	useWindowDimensions,
} from "react-native";
// Drawer buttons: gesture-handler Pressables (BottomSheet's first-tap fix)
import { Pressable } from "react-native-gesture-handler";
import AnimatedModal from "./AnimatedModal";
import BottomSheet, { SHEET_HANDLE_BLOCK, SHEET_RADIUS } from "./BottomSheet";
import { ModalBackdrop } from "./ModalArt";
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
	/** Optional choice ABOVE the confirm button (e.g. "Export My Data First" over a destructive Delete) */
	leadLabel?: string;
	leadColor?: string;
	onLead?: () => void;
	/** Optional second choice under the confirm button (e.g. "Just This One") */
	secondaryLabel?: string;
	secondaryColor?: string;
	onSecondary?: () => void;
	/** Optional third choice under the secondary one (e.g. "Just Mark It") */
	tertiaryLabel?: string;
	onTertiary?: () => void;
	cancelLabel?: string;
	/** Image flush with the top of the popup (full-bleed art); a shown title is laid over it in black.
	 *  Automatic for a ModalBackdrop, which hosts the title itself over a top shade */
	imageAtTop?: boolean;
	/** No title (the image / hint say it all) */
	hideTitle?: boolean;
	/** No Cancel button (tapping outside still closes) */
	hideCancel?: boolean;
	/** A bottom drawer instead of a centred popup (the banner confirms: backdrop art on top) */
	drawer?: boolean;
	/** Drawer only: the question under the art ("Do you want to pause this show?") */
	question?: string;
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
	leadLabel,
	leadColor,
	onLead,
	secondaryLabel,
	secondaryColor,
	onSecondary,
	tertiaryLabel,
	onTertiary,
	cancelLabel = "Cancel",
	imageAtTop = false,
	hideTitle = false,
	hideCancel = false,
	drawer = false,
	question,
	onClose,
}: Props) {
	const { width: screenW } = useWindowDimensions();
	if (drawer) {
		return (
			<ConfirmDrawer
				visible={visible}
				title={title}
				image={image}
				hint={hint}
				error={error}
				confirmLabel={confirmLabel}
				confirmColor={confirmColor}
				loading={loading}
				onConfirm={onConfirm}
				leadLabel={leadLabel}
				leadColor={leadColor}
				onLead={onLead}
				secondaryLabel={secondaryLabel}
				secondaryColor={secondaryColor}
				onSecondary={onSecondary}
				tertiaryLabel={tertiaryLabel}
				onTertiary={onTertiary}
				cancelLabel={cancelLabel}
				hideTitle={hideTitle}
				hideCancel={hideCancel}
				onClose={onClose}
				question={question}
				bannerWidth={screenW}
			/>
		);
	}
	// Photo art: up to the popup's top edge, the title on its own top shade
	const photo = isValidElement(image) && image.type === ModalBackdrop;
	const atTop = (imageAtTop || photo) && image != null;
	return (
		<AnimatedModal
			visible={visible}
			onClose={() => {
				if (!loading) onClose();
			}}
		>
			<View style={styles.content}>
				{atTop ? (
					<View style={styles.imageTop}>
						{photo && !hideTitle
							? cloneElement(image as React.ReactElement<{ heading?: string }>, { heading: title })
							: image}
						{!photo && !hideTitle && (
							<Text style={[styles.title, styles.titleOnImage]} pointerEvents="none">
								{title}
							</Text>
						)}
					</View>
				) : (
					<>
						{!hideTitle && <Text style={styles.title}>{title}</Text>}
						{image != null && <View style={styles.image}>{image}</View>}
					</>
				)}
				{hint ? <Text style={styles.hint}>{hint}</Text> : null}
				{error ? <Text style={styles.error}>{error}</Text> : null}
				{leadLabel && onLead && (
					<TouchableOpacity
						style={[
							styles.button,
							leadColor && { backgroundColor: leadColor },
							loading && { opacity: 0.6 },
						]}
						onPress={onLead}
						disabled={loading}
					>
						<Text style={styles.buttonText}>{leadLabel}</Text>
					</TouchableOpacity>
				)}
				<TouchableOpacity
					style={[
						styles.button,
						leadLabel && onLead && { marginTop: spacing.sm },
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
				{tertiaryLabel && onTertiary && (
					<TouchableOpacity
						style={[styles.button, styles.secondary, loading && { opacity: 0.6 }]}
						onPress={onTertiary}
						disabled={loading}
					>
						<Text style={styles.buttonText}>{tertiaryLabel}</Text>
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
		// Rounds the top of a title-over-image backdrop with the popup
		overflow: "hidden",
	},
	// Pulled up over the popup's top padding so the art meets the top edge
	imageTop: {
		alignItems: "center",
		marginTop: -spacing.lg,
		marginBottom: spacing.sm,
	},
	titleOnImage: {
		position: "absolute",
		top: spacing.md,
		left: spacing.lg,
		right: spacing.lg,
		marginBottom: 0,
		color: colors.background,
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
	// Full bleed, as the info drawer's art: up to the sheet's edges and top (over the grab
	// handle), its top corners rounding with the sheet's
	drawerBanner: {
		marginHorizontal: -spacing.lg,
		marginTop: -SHEET_HANDLE_BLOCK,
		marginBottom: spacing.lg,
		borderTopLeftRadius: SHEET_RADIUS,
		borderTopRightRadius: SHEET_RADIUS,
		overflow: "hidden",
	},
	// The grab handle, drawn again over the art (light, so it reads on any backdrop)
	drawerBannerHandle: {
		position: "absolute",
		top: spacing.sm,
		alignSelf: "center",
		width: 36,
		height: 4,
		borderRadius: 2,
		backgroundColor: "rgba(255,255,255,0.7)",
	},
	// Emil: a pressed button answers at once — a touch smaller, not a fade
	drawerPressed: { transform: [{ scale: 0.97 }] },
	drawerQuestion: {
		...typography.title,
		fontSize: 20,
		textAlign: "center",
		marginBottom: spacing.xs,
	},
	// Secondary to the question: lighter, a little tighter
	drawerHint: { lineHeight: 19, paddingHorizontal: spacing.sm },
	// Taller, softer buttons: one clear action, the way out quieter beside it
	drawerButton: {
		height: 52,
		paddingVertical: 0,
		borderRadius: 14,
		justifyContent: "center",
	},
	drawerButtonText: { fontSize: 16 },
	// Cancel: a quiet filled button (no outline competing with the action)
	drawerCancel: {
		backgroundColor: colors.surfaceLight,
		alignItems: "center",
		marginTop: spacing.sm,
	},
	drawerCancelText: { color: colors.textSecondary },
	cancelButton: {
		paddingVertical: spacing.md,
		borderRadius: 8,
		alignItems: "center",
		borderWidth: 1.5,
		borderColor: colors.text,
		marginTop: spacing.sm,
	},
});

type DrawerProps = Omit<Props, "drawer" | "imageAtTop"> & {
	confirmLabel: string;
	cancelLabel: string;
	/** The drawer's content width — a banner fills it */
	bannerWidth: number;
};

/** ConfirmModal as a bottom drawer: the banner (backdrop + logo, title over its top) full bleed
 *  at the top (as the info drawer's art), the hint, then the same buttons. Dismissed by Cancel,
 *  pulling it down or tapping outside (all locked while the action runs) */
function ConfirmDrawer({
	visible,
	title,
	image,
	hint,
	error,
	confirmLabel,
	confirmColor,
	loading = false,
	onConfirm,
	leadLabel,
	leadColor,
	onLead,
	secondaryLabel,
	secondaryColor,
	onSecondary,
	tertiaryLabel,
	onTertiary,
	cancelLabel,
	hideTitle = false,
	hideCancel = false,
	onClose,
	question,
	bannerWidth,
}: DrawerProps) {
	const photo = isValidElement(image) && image.type === ModalBackdrop;
	const banner = photo
		? cloneElement(
				image as React.ReactElement<{ heading?: string; width?: number; fadeTo?: string }>,
				{
					heading: hideTitle ? undefined : title,
					width: bannerWidth,
					// Fades into the sheet, as the info drawer's art
					fadeTo: colors.surface,
				},
			)
		: null;
	const button = (
		label: string,
		onPress: () => void,
		style: object[],
		content: ReactNode = <Text style={styles.buttonText}>{label}</Text>,
	) => (
		<Pressable
			onPress={onPress}
			disabled={loading}
			accessibilityRole="button"
			accessibilityLabel={label}
			style={({ pressed }) => [...style, pressed && !loading && styles.drawerPressed]}
		>
			{content}
		</Pressable>
	);
	return (
		<BottomSheet visible={visible} onClose={onClose} locked={loading}>
			{(close) => (
				<View>
					{banner ? (
						<View style={styles.drawerBanner}>
							{banner}
							<View style={styles.drawerBannerHandle} pointerEvents="none" />
						</View>
					) : (
						<>
							{!hideTitle && <Text style={styles.title}>{title}</Text>}
							{image != null && <View style={styles.image}>{image}</View>}
						</>
					)}
					{question ? <Text style={styles.drawerQuestion}>{question}</Text> : null}
					{hint ? <Text style={[styles.hint, styles.drawerHint]}>{hint}</Text> : null}
					{error ? <Text style={styles.error}>{error}</Text> : null}
					{leadLabel &&
						onLead &&
						button(leadLabel, onLead, [
							styles.button,
							styles.drawerButton,
							leadColor ? { backgroundColor: leadColor } : {},
							loading ? { opacity: 0.6 } : {},
						])}
					{button(
						confirmLabel,
						onConfirm,
						[
							styles.button,
							styles.drawerButton,
							leadLabel && onLead ? { marginTop: spacing.sm } : {},
							confirmColor ? { backgroundColor: confirmColor } : {},
							loading ? { opacity: 0.6 } : {},
						],
						loading ? (
							<ActivityIndicator size="small" color={colors.text} />
						) : (
							<Text style={[styles.buttonText, styles.drawerButtonText]}>{confirmLabel}</Text>
						),
					)}
					{secondaryLabel &&
						onSecondary &&
						button(secondaryLabel, onSecondary, [
							styles.button,
							styles.drawerButton,
							styles.secondary,
							secondaryColor ? { backgroundColor: secondaryColor } : {},
							loading ? { opacity: 0.6 } : {},
						])}
					{tertiaryLabel &&
						onTertiary &&
						button(tertiaryLabel, onTertiary, [
							styles.button,
							styles.drawerButton,
							styles.secondary,
							loading ? { opacity: 0.6 } : {},
						])}
					{/* Kept (dimmed) while the action runs: the drawer doesn't change height */}
					{!hideCancel &&
						button(
							cancelLabel,
							() => close(),
							[styles.drawerButton, styles.drawerCancel, loading ? { opacity: 0.4 } : {}],
							<Text style={[styles.buttonText, styles.drawerButtonText, styles.drawerCancelText]}>
								{cancelLabel}
							</Text>,
						)}
				</View>
			)}
		</BottomSheet>
	);
}
