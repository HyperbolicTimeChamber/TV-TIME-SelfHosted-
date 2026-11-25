import React, { useEffect, useRef, useState } from "react";
import { View, Text, Switch, TouchableOpacity, StyleSheet, PanResponder, TextInput, type LayoutChangeEvent } from "react-native";
import { colors, spacing, typography, themedStyles } from "../../theme";
import { DAY_NAMES, type NumberLimit } from "../../utils/notifyConfig";
import { fractionToValue, parseTyped, touchToFraction, unitLabel, valueToFraction } from "../../utils/sliderMath";

/** Building blocks of Settings → Notifications: a card, switch rows, chip pickers, an hour stepper */

/** "9 am", "12 pm", "midnight" */
export function hourLabel(hour: number): string {
	if (hour === 0) return "12 am";
	if (hour === 12) return "12 pm";
	return hour < 12 ? `${hour} am` : `${hour - 12} pm`;
}

export function Section({ title, children }: { title?: string; children: React.ReactNode }) {
	return (
		<View style={styles.section}>
			{title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
			{children}
		</View>
	);
}

/** A card row; `first` drops the divider above it */
export function Row({
	first,
	children,
	onPress,
	label,
}: {
	first?: boolean;
	children: React.ReactNode;
	onPress?: () => void;
	label?: string;
}) {
	const body = <View style={[styles.row, !first && styles.rowDivider]}>{children}</View>;
	if (!onPress) return body;
	return (
		<TouchableOpacity activeOpacity={0.7} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
			{body}
		</TouchableOpacity>
	);
}

export function SwitchRow({
	label,
	hint,
	value,
	onChange,
	first,
}: {
	label: string;
	hint?: string;
	value: boolean;
	onChange: (value: boolean) => void;
	first?: boolean;
}) {
	return (
		<Row first={first}>
			<View style={styles.textWrap}>
				<Text style={styles.rowText}>{label}</Text>
				{hint ? <Text style={styles.hint}>{hint}</Text> : null}
			</View>
			<Switch
				value={value}
				onValueChange={onChange}
				// The brand red (primary) when on; Android's default teal is off-palette
				trackColor={{ true: colors.primary, false: colors.border }}
				thumbColor={colors.onPrimary}
				accessibilityLabel={label}
			/>
		</Row>
	);
}

/** A detail under a switch: label on top, its control below, indented as a child of the row above */
export function Detail({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
	return (
		<View style={styles.detail}>
			<Text style={styles.detailLabel}>{label}</Text>
			{hint ? <Text style={styles.hint}>{hint}</Text> : null}
			<View style={styles.detailControl}>{children}</View>
		</View>
	);
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
	return (
		<TouchableOpacity
			style={[styles.chip, selected && styles.chipOn]}
			onPress={onPress}
			activeOpacity={0.7}
			accessibilityRole="button"
			accessibilityState={{ selected }}
			accessibilityLabel={label}
		>
			<Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
		</TouchableOpacity>
	);
}

/** One choice of several */
export function Chips<T extends string | number>({
	options,
	value,
	onChange,
}: {
	options: { value: T; label: string }[];
	value: T | null;
	onChange: (value: T) => void;
}) {
	return (
		<View style={styles.chips}>
			{options.map((o) => (
				<Chip key={String(o.value)} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
			))}
		</View>
	);
}

/** Any number of choices; at least `min` stay selected */
export function MultiChips<T extends string | number>({
	options,
	value,
	onChange,
	min = 0,
}: {
	options: { value: T; label: string }[];
	value: T[];
	onChange: (value: T[]) => void;
	min?: number;
}) {
	return (
		<View style={styles.chips}>
			{options.map((o) => {
				const selected = value.includes(o.value);
				return (
					<Chip
						key={String(o.value)}
						label={o.label}
						selected={selected}
						onPress={() => {
							if (selected && value.length <= min) return;
							onChange(selected ? value.filter((v) => v !== o.value) : [...value, o.value]);
						}}
					/>
				);
			})}
		</View>
	);
}

const DAY_OPTIONS = DAY_NAMES.map((label, value) => ({ value, label }));

/** One weekday */
export function WeekdayChips({ value, onChange }: { value: number; onChange: (day: number) => void }) {
	return <Chips options={DAY_OPTIONS} value={value} onChange={onChange} />;
}

/** Several weekdays (at least one) */
export function WeekdaysChips({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
	return <MultiChips options={DAY_OPTIONS} value={value} onChange={onChange} min={1} />;
}

const THUMB = 26;

/**
 * A whole-number slider over `limit.min`–`limit.max` with a box beside it for a typed value: the box accepts digits
 * only (no negatives) up to `limit.custom`, so a value past the slider's end is possible. Past the end the thumb
 * sits at the end. `unit` words the value ("day" → "1 day", "5 days"); `zero` words 0 ("No limit")
 */
export function NumberSlider({
	value,
	limit,
	onChange,
	unit,
	plural,
	zero,
	label,
}: {
	value: number;
	limit: NumberLimit;
	onChange: (value: number) => void;
	unit: string;
	plural?: string;
	zero?: string;
	label: string;
}) {
	const [width, setWidth] = useState(0);
	// What is being typed while the box has focus (null = show the value)
	const [draft, setDraft] = useState<string | null>(null);
	const live = useRef({ limit, onChange, width: 0 });
	live.current = { limit, onChange, width };
	const startX = useRef(0);

	const setFromX = (x: number) => {
		const { limit: l, onChange: change, width: w } = live.current;
		const next = fractionToValue(touchToFraction(x, w, THUMB), l);
		change(next);
	};
	const pan = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: () => true,
			// Inside a ScrollView: keep the drag once it starts
			onPanResponderTerminationRequest: () => false,
			onPanResponderGrant: (e) => {
				startX.current = e.nativeEvent.locationX;
				setFromX(startX.current);
			},
			onPanResponderMove: (_, g) => setFromX(startX.current + g.dx),
		}),
	).current;

	// A value changed from outside (reset, preset) replaces what was typed
	useEffect(() => {
		setDraft(null);
	}, [value]);

	const fraction = valueToFraction(value, limit);
	const thumbLeft = fraction * Math.max(0, width - THUMB);
	const step = (d: number) => onChange(Math.min(limit.custom, Math.max(limit.min, value + d)));
	const words = `${value === 0 && zero ? "" : `${value} `}${unitLabel(value, unit, plural, zero)}`;

	return (
		<View style={styles.sliderRow}>
			<View
				style={styles.sliderArea}
				onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
				accessible
				accessibilityRole="adjustable"
				accessibilityLabel={label}
				accessibilityValue={{ min: limit.min, max: limit.custom, now: value, text: words }}
				accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
				onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
				{...pan.panHandlers}
			>
				{/* Children ignore touches so locationX is the track's */}
				<View pointerEvents="none" style={styles.sliderTrackWrap}>
					<View style={styles.sliderTrack} />
					<View style={[styles.sliderFill, { width: thumbLeft + THUMB / 2 }]} />
					<View style={[styles.sliderThumb, { left: thumbLeft }]} />
				</View>
			</View>
			<TextInput
				style={styles.sliderInput}
				value={draft ?? String(value)}
				keyboardType="number-pad"
				maxLength={5}
				selectTextOnFocus
				accessibilityLabel={`${label}, type a number`}
				onChangeText={(text) => {
					const digits = text.replace(/\D/g, "");
					setDraft(digits);
					const parsed = parseTyped(digits, limit);
					if (parsed !== null) onChange(parsed);
				}}
				onBlur={() => setDraft(null)}
			/>
			<Text style={styles.sliderUnit} numberOfLines={1}>
				{value === 0 && zero ? zero : unitLabel(value, unit, plural)}
			</Text>
		</View>
	);
}

/** − 9 am + (wraps around midnight) */
export function HourStepper({ value, onChange, label }: { value: number; onChange: (hour: number) => void; label: string }) {
	const step = (d: number) => onChange((value + d + 24) % 24);
	return (
		<View style={styles.stepper}>
			<TouchableOpacity
				style={styles.stepButton}
				onPress={() => step(-1)}
				accessibilityRole="button"
				accessibilityLabel={`${label}: earlier`}
				hitSlop={6}
			>
				<Text style={styles.stepGlyph}>−</Text>
			</TouchableOpacity>
			<Text style={styles.stepValue} accessibilityLabel={`${label}: ${hourLabel(value)}`}>
				{hourLabel(value)}
			</Text>
			<TouchableOpacity
				style={styles.stepButton}
				onPress={() => step(1)}
				accessibilityRole="button"
				accessibilityLabel={`${label}: later`}
				hitSlop={6}
			>
				<Text style={styles.stepGlyph}>+</Text>
			</TouchableOpacity>
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
		row: {
			flexDirection: "row",
			alignItems: "center",
			gap: spacing.md,
			paddingVertical: spacing.md,
			paddingHorizontal: spacing.md,
		},
		rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
		textWrap: { flex: 1 },
		rowText: { ...typography.subtitle, fontSize: 15, color: colors.text },
		hint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
		detail: {
			paddingHorizontal: spacing.md,
			paddingBottom: spacing.md,
			paddingLeft: spacing.xl,
		},
		detailLabel: { ...typography.caption, color: colors.text },
		detailControl: { marginTop: spacing.xs },
		chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingRight: spacing.md },
		chip: {
			paddingHorizontal: spacing.md,
			paddingVertical: 7,
			borderRadius: 16,
			backgroundColor: colors.border,
		},
		chipOn: { backgroundColor: colors.primary },
		chipText: { ...typography.caption, color: colors.text },
		chipTextOn: { color: colors.onPrimary, fontWeight: "700" },
		sliderRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
		sliderArea: { flex: 1, height: 44, justifyContent: "center" },
		sliderTrackWrap: { height: THUMB, justifyContent: "center" },
		sliderTrack: { height: 4, borderRadius: 2, backgroundColor: colors.border },
		sliderFill: { position: "absolute", left: 0, height: 4, borderRadius: 2, backgroundColor: colors.primary },
		sliderThumb: {
			position: "absolute",
			top: 0,
			width: THUMB,
			height: THUMB,
			borderRadius: THUMB / 2,
			backgroundColor: colors.primary,
			borderWidth: 3,
			borderColor: colors.surface,
		},
		sliderInput: {
			...typography.subtitle,
			fontSize: 15,
			color: colors.text,
			backgroundColor: colors.border,
			borderRadius: 8,
			minWidth: 54,
			paddingVertical: 6,
			paddingHorizontal: spacing.sm,
			textAlign: "center",
		},
		sliderUnit: { ...typography.caption, color: colors.textMuted, minWidth: 52 },
		stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
		stepButton: {
			width: 34,
			height: 34,
			borderRadius: 17,
			backgroundColor: colors.border,
			alignItems: "center",
			justifyContent: "center",
		},
		stepGlyph: { ...typography.subtitle, color: colors.text, lineHeight: 22 },
		stepValue: { ...typography.subtitle, fontSize: 15, color: colors.text, minWidth: 56, textAlign: "center" },
	}),
);
