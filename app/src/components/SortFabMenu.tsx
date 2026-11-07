import { useCallback, useEffect, useState } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
	Easing,
	interpolate,
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withTiming,
	type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../theme";
import type { SortOption } from "./SortSheet";
import Svg, { Path } from "react-native-svg";

const FAB_SIZE = 56;
const PILL_HEIGHT = 48;
const PILL_GAP = 10;
const OPEN_MS = 240;
const CLOSE_MS = 160;
/** The button spins this far as its icon turns into ✕ (and back) */
const SPIN_DEG = 180;
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Each pill starts this much of the open progress after the one below it (nearest the FAB first) */
const STAGGER = 0.12;
/** Pills rise this far into place */
const RISE = 12;
const TICK_SIZE = 24;

/** The picked pill's tick: a bold stroke, heavier than the icon set's checkmarks */
function BoldTick() {
	return (
		<Svg width={TICK_SIZE} height={TICK_SIZE} viewBox="0 0 24 24" fill="none">
			<Path
				d="M5 12.5l4.5 4.5L19 7.5"
				stroke={colors.text}
				strokeWidth={2.75}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</Svg>
	);
}

/** Sort-only button icon: lines shortening downwards beside a down arrow */
export function SortIcon({ size = 26 }: Readonly<{ size?: number }>) {
	return (
		<Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
			<Path
				d="M3 6h11M5.5 10h8.5M8 14h6M10.5 18H14M19 5v13M16 15l3 3 3-3"
				stroke={colors.text}
				strokeWidth={2}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</Svg>
	);
}

/** "A → Z": the arrow as an icon, centred on the letters (the text glyph sat low) */
function PillLabel({ label }: Readonly<{ label: string }>) {
	const parts = label.split(" → ");
	if (parts.length !== 2) return <Text style={styles.pillText}>{label}</Text>;
	return (
		<View style={styles.arrowLabel} accessible accessibilityLabel={label}>
			<Text style={styles.pillText}>{parts[0]}</Text>
			<FontAwesome5 name="long-arrow-alt-right" size={14} color={colors.text} />
			<Text style={styles.pillText}>{parts[1]}</Text>
		</View>
	);
}

interface Props<T> {
	/** Distance from the bottom of the parent (include the safe-area inset where needed) */
	bottom: number;
	options: readonly SortOption<T>[];
	selected: T;
	onSelect: (value: T) => void;
	isSame: (a: T, b: T) => boolean;
	/** Sort changed from the default — shows a dot on the closed button */
	customised: boolean;
	accessibilityLabel: string;
}

function Pill<T>({
	option,
	active,
	order,
	progress,
	onPress,
}: Readonly<{
	option: SortOption<T>;
	active: boolean;
	/** 0 = nearest the FAB */
	order: number;
	progress: SharedValue<number>;
	onPress: () => void;
}>) {
	const start = order * STAGGER;
	const style = useAnimatedStyle(() => {
		const p = interpolate(progress.get(), [start, Math.min(1, start + 0.6)], [0, 1], "clamp");
		return {
			opacity: p,
			transform: [{ translateY: (1 - p) * RISE }, { scale: 0.9 + 0.1 * p }],
		};
	});
	return (
		<Animated.View style={style}>
			<Pressable
				style={({ pressed }) => [
					styles.pill,
					active && styles.pillActive,
					pressed && !active && styles.pillPressed,
				]}
				onPress={onPress}
				accessibilityRole="button"
				accessibilityState={{ selected: active }}
			>
				{active && <BoldTick />}
				<PillLabel label={option.label} />
			</Pressable>
		</Animated.View>
	);
}

/**
 * Floating red sort button that opens its options as a stack of pills above itself (the button
 * turns into ✕) — the picked one red with a tick, the rest the sort sheet's grey. Tap outside,
 * ✕ or Android back closes it.
 */
export default function SortFabMenu<T>({
	bottom,
	options,
	selected,
	onSelect,
	isSame,
	customised,
	accessibilityLabel,
}: Readonly<Props<T>>) {
	const reducedMotion = useReducedMotion();
	const [open, setOpen] = useState(false);
	// Stays mounted through the closing animation
	const [mounted, setMounted] = useState(false);
	const progress = useSharedValue(0);

	const show = useCallback(() => {
		setMounted(true);
		setOpen(true);
		progress.set(withTiming(1, { duration: reducedMotion ? 0 : OPEN_MS, easing: EASE_OUT }));
	}, [progress, reducedMotion]);
	const hide = useCallback(() => {
		setOpen(false);
		progress.set(
			withTiming(0, { duration: reducedMotion ? 0 : CLOSE_MS, easing: EASE_OUT }, (finished) => {
				"worklet";
				if (finished) scheduleOnRN(setMounted, false);
			}),
		);
	}, [progress, reducedMotion]);

	useEffect(() => {
		if (!open) return;
		const sub = BackHandler.addEventListener("hardwareBackPress", () => {
			hide();
			return true;
		});
		return () => sub.remove();
	}, [open, hide]);

	const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
	const openIcon = useAnimatedStyle(() => ({
		opacity: 1 - progress.get(),
		transform: [{ rotate: `${progress.get() * SPIN_DEG}deg` }],
	}));
	const closeIcon = useAnimatedStyle(() => ({
		opacity: progress.get(),
		transform: [{ rotate: `${(progress.get() - 1) * SPIN_DEG}deg` }],
	}));

	return (
		<>
			{mounted && (
				<Animated.View
					style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
					pointerEvents={open ? "auto" : "none"}
				>
					<Pressable style={StyleSheet.absoluteFill} onPress={hide} accessibilityLabel="Close" />
				</Animated.View>
			)}
			{mounted && (
				<View
					style={[styles.pills, { bottom: bottom + FAB_SIZE + PILL_GAP + 4 }]}
					pointerEvents={open ? "box-none" : "none"}
				>
					{options.map((option, i) => (
						<Pill
							key={option.label}
							option={option}
							active={isSame(option.value, selected)}
							// Top of the column is the last to appear
							order={options.length - 1 - i}
							progress={progress}
							onPress={() => {
								onSelect(option.value);
								hide();
							}}
						/>
					))}
				</View>
			)}
			<View style={[styles.fab, { bottom }]}>
				<Pressable
					style={styles.fabPress}
					onPress={open ? hide : show}
					accessibilityLabel={open ? "Close sort menu" : accessibilityLabel}
					accessibilityState={{ expanded: open }}
				>
					<Animated.View style={[styles.icon, openIcon]}>
						<SortIcon />
					</Animated.View>
					<Animated.View style={[styles.icon, closeIcon]}>
						<Ionicons name="close" size={26} color={colors.text} />
					</Animated.View>
					{customised && !open && <View style={styles.dot} />}
				</Pressable>
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	backdrop: { backgroundColor: "rgba(0, 0, 0, 0.55)" },
	pills: {
		position: "absolute",
		right: spacing.lg,
		alignItems: "flex-end",
		gap: PILL_GAP,
	},
	pill: {
		height: PILL_HEIGHT,
		borderRadius: PILL_HEIGHT / 2,
		paddingHorizontal: spacing.xl,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		// The sort sheet's grey
		backgroundColor: colors.surface,
		elevation: 6,
		shadowColor: colors.background,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.5,
		shadowRadius: 8,
	},
	// The tick leads, close to the pill's start
	pillActive: { backgroundColor: colors.primary, paddingLeft: spacing.sm + 2, gap: spacing.xs },
	pillPressed: { backgroundColor: colors.surfaceLight },
	pillText: { color: colors.text, fontSize: 15, fontWeight: "600" },
	arrowLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
	fab: {
		position: "absolute",
		right: spacing.lg,
		width: FAB_SIZE,
		height: FAB_SIZE,
		borderRadius: FAB_SIZE / 2,
		backgroundColor: colors.primary,
		elevation: 6,
	},
	fabPress: { flex: 1, alignItems: "center", justifyContent: "center" },
	icon: { position: "absolute" },
	// Not at default
	dot: {
		position: "absolute",
		top: 12,
		right: 12,
		width: 9,
		height: 9,
		borderRadius: 5,
		backgroundColor: colors.text,
	},
});
