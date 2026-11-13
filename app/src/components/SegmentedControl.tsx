import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { colors, spacing, themedStyles } from "../theme";

interface Option<T> {
	value: T;
	label: string;
}

interface Props<T> {
	options: readonly Option<T>[];
	selected: T;
	onSelect: (value: T) => void;
	isSame?: (a: T, b: T) => boolean;
}

/** Slide between options: critically damped, quick — a small control, seen often */
const PILL_SPRING = { damping: 26, stiffness: 320, mass: 1, useNativeDriver: true } as const;
const INSET = 3;

/**
 * Two or three mutually exclusive choices in one track, the active one on a pill that slides to
 * the next pick (the eye follows the change instead of two rows swapping fills). Selection tick
 * on change. Same height as a sheet row, so it drops into a sort sheet's place.
 */
export default function SegmentedControl<T>({
	options,
	selected,
	onSelect,
	isSame = (a, b) => a === b,
}: Props<T>) {
	const [width, setWidth] = useState(0);
	const index = Math.max(
		0,
		options.findIndex((o) => isSame(o.value, selected)),
	);
	const segment = width > 0 ? (width - INSET * 2) / options.length : 0;
	const x = useRef(new Animated.Value(0)).current;
	const placed = useRef(false);

	useEffect(() => {
		if (segment === 0) return;
		// First measure: sit on the selection without sliding in from the left
		if (!placed.current) {
			placed.current = true;
			x.setValue(index * segment);
			return;
		}
		Animated.spring(x, { ...PILL_SPRING, toValue: index * segment }).start();
	}, [index, segment, x]);

	return (
		<View
			style={styles.track}
			onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
			accessibilityRole="tablist"
		>
			{segment > 0 && (
				<Animated.View
					style={[styles.pill, { width: segment, transform: [{ translateX: x }] }]}
				/>
			)}
			{options.map((option, i) => {
				const active = i === index;
				return (
					<Pressable
						key={option.label}
						style={({ pressed }) => [styles.segment, pressed && !active && styles.pressed]}
						onPress={() => {
							if (active) return;
							Haptics.selectionAsync().catch(() => {});
							onSelect(option.value);
						}}
						accessibilityRole="tab"
						accessibilityState={{ selected: active }}
					>
						<Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
							{option.label}
						</Text>
					</Pressable>
				);
			})}
		</View>
	);
}

const styles = themedStyles(() => StyleSheet.create({
	track: {
		flexDirection: "row",
		padding: INSET,
		borderRadius: 14,
		backgroundColor: colors.surfaceLight,
	},
	pill: {
		position: "absolute",
		top: INSET,
		bottom: INSET,
		left: INSET,
		borderRadius: 11,
		backgroundColor: colors.primary,
	},
	segment: {
		flex: 1,
		minHeight: 40,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.sm,
	},
	// Press feedback on the idle side: a touch smaller, never from nothing
	pressed: { transform: [{ scale: 0.97 }], opacity: 0.8 },
	label: { fontSize: 15, fontWeight: "600", color: colors.textSecondary },
	labelActive: { color: colors.text },
}));
