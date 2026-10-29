import React, { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
	View,
	Text,
	Pressable,
	Modal,
	Animated,
	Easing,
	PanResponder,
	StyleSheet,
	Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { tmdbLogoUri } from "../../hooks/useTmdbImage";
import { useTitleLogo } from "../../hooks/useTitleLogo";
import WatchCountPill from "../WatchCountPill";
import type { MediaType } from "../../types";
import { colors, spacing, tint, typography } from "../../theme";

const SCREEN_HEIGHT = Dimensions.get("window").height;

/** Slide-in / snap-back: critically damped, never past its resting place — an overshoot lifted
 *  the sheet off the bottom edge and showed the page under it */
const SHEET_SPRING = {
	toValue: 0,
	damping: 30,
	stiffness: 220,
	overshootClamping: true,
	useNativeDriver: true,
} as const;
/** Exit: faster than the entry, iOS drawer curve */
const SHEET_EXIT = {
	toValue: SCREEN_HEIGHT,
	duration: 220,
	easing: Easing.bezier(0.32, 0.72, 0, 1),
	useNativeDriver: true,
} as const;
/** Drag past this (or flick) → dismiss */
const DISMISS_DISTANCE = 80;
const DISMISS_VELOCITY = 0.5;

/** Logo box: at least MIN_W wide / MIN_H tall so wide or tiny logos stay legible, within MAX_*
 *  (a centred logo has the whole width; next to the count pill it has less) */
const LOGO_MIN_W = 160;
const LOGO_MIN_H = 44;
const LOGO_MAX_W = 280;
const LOGO_MAX_W_BESIDE_PILL = 200;
const LOGO_MAX_H = 72;

/** Logo size for its shape: grow to the min height (or min width), clamp to the max box */
function logoSize(ratio: number, maxW: number) {
	let w = Math.min(maxW, Math.max(LOGO_MIN_W, ratio * LOGO_MIN_H));
	let h = w / ratio;
	if (h > LOGO_MAX_H) {
		h = LOGO_MAX_H;
		w = h * ratio;
	}
	return { width: w, height: h };
}

/** Closes the sheet (slide out), then runs `after` once it's gone */
export type CloseSheet = (after?: () => void) => void;

interface Props {
	visible: boolean;
	onClose: () => void;
	children: (close: CloseSheet) => ReactNode;
}

/** Bottom sheet shell: dimmed backdrop that fades with the sheet, drag down / tap outside to close */
export default function BottomSheet({ visible, onClose, children }: Props) {
	const insets = useSafeAreaInsets();
	const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
	// Backdrop follows the sheet (drag included) instead of popping in and out
	const backdropOpacity = translateY.interpolate({
		inputRange: [0, SCREEN_HEIGHT / 2],
		outputRange: [1, 0],
		extrapolate: "clamp",
	});

	useEffect(() => {
		if (visible) Animated.spring(translateY, SHEET_SPRING).start();
		else translateY.setValue(SCREEN_HEIGHT);
	}, [visible, translateY]);

	const close = useCallback<CloseSheet>(
		(after) => {
			Animated.timing(translateY, SHEET_EXIT).start(() => {
				onClose();
				after?.();
			});
		},
		[translateY, onClose],
	);
	// The pan responder is made once — it reads the latest close through this
	const closeRef = useRef(close);
	closeRef.current = close;

	const panResponder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => false,
			onMoveShouldSetPanResponder: (_, gs) => gs.dy > 8 && Math.abs(gs.dy) > Math.abs(gs.dx),
			onPanResponderMove: (_, gs) => {
				// Upward drag gets resistance instead of a hard stop
				translateY.setValue(gs.dy > 0 ? gs.dy : -Math.sqrt(-gs.dy) * 2);
			},
			onPanResponderRelease: (_, gs) => {
				if (gs.dy > DISMISS_DISTANCE || gs.vy > DISMISS_VELOCITY) closeRef.current();
				else Animated.spring(translateY, SHEET_SPRING).start();
			},
		}),
	).current;

	return (
		<Modal
			visible={visible}
			transparent
			animationType="none"
			statusBarTranslucent
			onRequestClose={() => close()}
		>
			<View style={styles.root}>
				<Animated.View
					style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}
				>
					<Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
				</Animated.View>
				<Animated.View
					style={[
						styles.sheet,
						{ paddingBottom: Math.max(spacing.xl, insets.bottom + spacing.md) },
						{ transform: [{ translateY }] },
					]}
					{...panResponder.panHandlers}
				>
					<View style={styles.handle} />
					{children(close)}
				</Animated.View>
			</View>
		</Modal>
	);
}

/** Title logo (its name when there's none) — fixed height so the header never jumps */
function SheetLogo({
	title,
	tmdbId,
	mediaType,
	logoPath: givenLogo,
	centered,
}: {
	title: string;
	tmdbId?: number;
	mediaType?: MediaType;
	logoPath?: string | null;
	centered: boolean;
}) {
	const logoPath = useTitleLogo(givenLogo, tmdbId, mediaType);
	const [ratio, setRatio] = useState<number | null>(null);
	const [failed, setFailed] = useState(false);
	const showLogo = !!logoPath && !failed;
	const size = ratio ? logoSize(ratio, centered ? LOGO_MAX_W : LOGO_MAX_W_BESIDE_PILL) : null;
	return (
		<View style={[styles.logoSlot, centered && styles.logoSlotCentered]}>
			{(!showLogo || !ratio) && (
				<Text style={[styles.name, centered && styles.nameCentered]} numberOfLines={2}>
					{title}
				</Text>
			)}
			{showLogo && (
				<Image
					source={{ uri: tmdbLogoUri(logoPath, LOGO_MAX_W * 2) }}
					style={size ?? styles.logoLoading}
					contentFit="contain"
					contentPosition={centered ? "center" : "left"}
					onLoad={(e) => setRatio(e.source.width / e.source.height)}
					onError={() => setFailed(true)}
					accessibilityLabel={title}
				/>
			)}
		</View>
	);
}

/** Logo (name fallback) + what the sheet is about on the left, watch count pill on the right.
 *  No `watchCount` → just the logo, centred (the sheet shows the count itself) */
export function SheetHeader({
	title,
	subtitle,
	tmdbId,
	mediaType,
	logoPath,
	watchCount,
}: {
	title: string;
	subtitle?: string;
	tmdbId?: number;
	mediaType?: MediaType;
	logoPath?: string | null;
	watchCount?: number;
}) {
	const centered = watchCount === undefined;
	return (
		<View style={styles.header}>
			<View style={styles.headerText}>
				<SheetLogo
					title={title}
					tmdbId={tmdbId}
					mediaType={mediaType}
					logoPath={logoPath}
					centered={centered}
				/>
				{subtitle ? (
					<Text style={styles.subtitle} numberOfLines={1}>
						{subtitle}
					</Text>
				) : null}
			</View>
			{!centered && <WatchCountPill count={watchCount} style={styles.headerPill} />}
		</View>
	);
}

/** Rows grouped in one rounded card, hairlines between them */
export function SheetGroup({ children }: { children: ReactNode }) {
	const rows = React.Children.toArray(children).filter(Boolean);
	return (
		<View style={styles.group}>
			{rows.map((row, i) => (
				<React.Fragment key={i}>
					{i > 0 && <View style={styles.separator} />}
					{row}
				</React.Fragment>
			))}
		</View>
	);
}

/** Icon tile (tinted), title + hint; scales a touch on press */
export function SheetOption({
	icon,
	color,
	title,
	hint,
	destructive = false,
	onPress,
}: {
	icon: React.ComponentProps<typeof Ionicons>["name"];
	color: `#${string}`;
	title: string;
	hint?: string;
	destructive?: boolean;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
		>
			<SheetIcon icon={icon} color={color} />
			<View style={styles.optionContent}>
				<Text style={[styles.optionText, destructive && styles.destructiveText]}>{title}</Text>
				{hint ? <Text style={styles.optionHint}>{hint}</Text> : null}
			</View>
		</Pressable>
	);
}

export function SheetIcon({
	icon,
	color,
}: {
	icon: React.ComponentProps<typeof Ionicons>["name"];
	color: `#${string}`;
}) {
	return (
		<View style={[styles.iconTile, { backgroundColor: tint(color, 0.16) }]}>
			<Ionicons name={icon} size={20} color={color} />
		</View>
	);
}

export const sheetStyles = StyleSheet.create({
	/** Row layout for custom rows inside a SheetGroup (same metrics as SheetOption) */
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.md,
	},
	rowContent: { flex: 1 },
	rowText: { ...typography.subtitle, fontSize: 15 },
	rowHint: { ...typography.caption, fontSize: 12, marginTop: 2 },
});

const styles = StyleSheet.create({
	root: { flex: 1, justifyContent: "flex-end" },
	backdrop: { backgroundColor: colors.overlayLight },
	sheet: {
		backgroundColor: colors.surface,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		paddingHorizontal: spacing.lg,
	},
	handle: {
		width: 36,
		height: 4,
		borderRadius: 2,
		backgroundColor: colors.textMuted,
		alignSelf: "center",
		marginTop: spacing.sm,
		marginBottom: spacing.md,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		marginBottom: spacing.lg,
	},
	headerText: { flex: 1, minWidth: 0 },
	headerPill: { backgroundColor: colors.surfaceLight },
	logoSlot: { minHeight: LOGO_MIN_H, justifyContent: "center", alignItems: "flex-start" },
	logoSlotCentered: { alignItems: "center" },
	nameCentered: { textAlign: "center" },
	// Full size while loading (so it decodes and reports its true shape), invisible, out of flow
	logoLoading: { position: "absolute", width: LOGO_MAX_W, height: LOGO_MIN_H, opacity: 0 },
	name: { ...typography.subtitle, fontSize: 18 },
	subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
	group: {
		backgroundColor: colors.surfaceLight,
		borderRadius: 14,
		overflow: "hidden",
	},
	separator: {
		height: StyleSheet.hairlineWidth,
		backgroundColor: colors.border,
		// Starts under the text, not the icon tile
		marginLeft: spacing.md + 36 + spacing.md,
	},
	option: sheetStyles.row,
	optionPressed: { backgroundColor: colors.border, transform: [{ scale: 0.98 }] },
	optionContent: sheetStyles.rowContent,
	optionText: sheetStyles.rowText,
	optionHint: sheetStyles.rowHint,
	destructiveText: { color: colors.destructiveRed },
	iconTile: {
		width: 36,
		height: 36,
		borderRadius: 10,
		alignItems: "center",
		justifyContent: "center",
	},
});
