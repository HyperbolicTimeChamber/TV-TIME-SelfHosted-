import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import Reanimated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import BottomSheet, {
	SheetCollapse,
	SheetGroup,
	SheetIcon,
	type SheetIconName,
} from "./BottomSheet";
import { HiCheck } from "../HiIcons";
import { ExportContent, ExportFilter, ExportPart, ExportScope } from "../../enums";
import {
	EXPORT_FILTERS,
	EXPORT_TITLE_PARTS,
	accountExportOptions,
	type AccountExportOptions,
} from "../../utils/accountExport";
import { colors, spacing, typography, themedStyles } from "../../theme";

interface Props {
	visible: boolean;
	onClose: () => void;
	/** Export pressed: the sheet has slid out; the export runs with these options */
	onExport: (options: AccountExportOptions) => void;
}

const SCOPES: Array<{
	scope: ExportScope;
	icon: SheetIconName;
	color: `#${string}`;
	title: string;
	hint: string;
}> = [
	{
		scope: ExportScope.ALL,
		icon: "albums-outline",
		get color() {
			return colors.primary as `#${string}`;
		},
		title: "All",
		hint: "Every show and movie you track",
	},
	{
		scope: ExportScope.MOVIES,
		icon: "film-outline",
		get color() {
			return colors.moviePurple as `#${string}`;
		},
		title: "Movies",
		hint: "Only your movies",
	},
	{
		scope: ExportScope.TV,
		icon: "tv-outline",
		get color() {
			return colors.watchedGreen as `#${string}`;
		},
		title: "TV Shows",
		hint: "Only your shows",
	},
	{
		scope: ExportScope.LISTS,
		icon: "bookmarks-outline",
		get color() {
			return colors.warningAmber as `#${string}`;
		},
		title: "Custom lists",
		hint: "Just your lists and the titles in them — no tracking data",
	},
];

/** Each sub-option's name and what sets it apart */
const FILTER_LABELS: Record<ExportFilter, { movies: [string, string]; tv: [string, string] }> = {
	[ExportFilter.ALL]: {
		movies: ["All Movies", "Every movie you track, watched or not"],
		tv: ["All Shows", "Every show you track"],
	},
	[ExportFilter.MOVIES_TO_WATCH]: {
		movies: ["Movies to be watched", "Already out, but you haven't watched them yet"],
		tv: ["", ""],
	},
	[ExportFilter.MOVIES_UPCOMING]: {
		movies: ["Upcoming movies", "Not released yet"],
		tv: ["", ""],
	},
	[ExportFilter.TV_ENDED]: {
		movies: ["", ""],
		tv: ["Ended shows", "Finished or cancelled — no new episodes coming"],
	},
	[ExportFilter.TV_ONGOING]: {
		movies: ["", ""],
		tv: ["Ongoing shows", "Still airing or coming back"],
	},
};

const CONTENTS: Array<{
	content: ExportContent;
	icon: SheetIconName;
	color: `#${string}`;
	title: string;
	hint: string;
}> = [
	{
		content: ExportContent.EVERYTHING,
		icon: "cube-outline",
		get color() {
			return colors.primary as `#${string}`;
		},
		title: "All the data",
		// Replaced for everything (a full backup takes the lists too) — see contentHint
		hint: "Progress and watch history of these titles",
	},
	{
		content: ExportContent.CHOSEN,
		icon: "options-outline",
		get color() {
			return colors.warningAmber as `#${string}`;
		},
		title: "Certain data",
		hint: "Pick which parts go in the file",
	},
	{
		content: ExportContent.TITLES,
		icon: "list-outline",
		get color() {
			return colors.moviePurple as `#${string}`;
		},
		title: "Titles only",
		hint: "Just the names of the shows and movies — no progress or history",
	},
];

const PARTS: Array<{ part: ExportPart; title: string; hint: string }> = [
	{
		part: ExportPart.PROGRESS,
		title: "Watch progress",
		hint: "Each title's status, next episode and rewatch count",
	},
	{
		part: ExportPart.HISTORY,
		title: "Watch history",
		hint: "Every episode and movie you watched, with dates and counts",
	},
];

/** A step sliding in: from the side it comes from, ease-out (a response to the tap), quick */
const STEP_IN = { duration: 220, easing: Easing.bezier(0.23, 1, 0.32, 1) };
const STEP_SHIFT = 24;

function StepIn({ from, children }: Readonly<{ from: 1 | -1; children: React.ReactNode }>) {
	const t = useSharedValue(0);
	useEffect(() => {
		t.value = withTiming(1, STEP_IN);
	}, [t]);
	const style = useAnimatedStyle(() => ({
		opacity: t.value,
		transform: [{ translateX: from * STEP_SHIFT * (1 - t.value) }],
	}));
	return <Reanimated.View style={style}>{children}</Reanimated.View>;
}

/** A radio / checkbox mark: ring when off, filled with a tick when on */
function Mark({ on, square = false }: Readonly<{ on: boolean; square?: boolean }>) {
	return (
		<View style={[styles.mark, square && styles.markSquare, on && styles.markOn]}>
			{on && <HiCheck size={14} color={colors.onPrimary} />}
		</View>
	);
}

function ChoiceRow({
	icon,
	color,
	title,
	hint,
	on,
	onPress,
	square = false,
	sub = false,
}: Readonly<{
	icon?: SheetIconName;
	color?: `#${string}`;
	title: string;
	hint?: string;
	on: boolean;
	onPress: () => void;
	square?: boolean;
	/** A sub-option under its parent row: indented, no icon tile */
	sub?: boolean;
}>) {
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole={square ? "checkbox" : "radio"}
			accessibilityState={{ checked: on }}
			style={({ pressed }) => [styles.row, sub && styles.subRow, pressed && styles.rowPressed]}
		>
			{icon && color ? <SheetIcon icon={icon} color={color} /> : null}
			<View style={styles.rowContent}>
				<Text style={[styles.rowText, sub && styles.subText]}>{title}</Text>
				{hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
			</View>
			{/* Sub-options are square ticks (step 1's filters pick one, step 2's parts any) */}
			<Mark on={on} square={square || sub} />
		</Pressable>
	);
}

function SheetButton({
	label,
	onPress,
	primary = false,
	disabled = false,
}: Readonly<{ label: string; onPress: () => void; primary?: boolean; disabled?: boolean }>) {
	return (
		<Pressable
			onPress={disabled ? undefined : onPress}
			accessibilityRole="button"
			accessibilityState={{ disabled }}
			style={({ pressed }) => [
				styles.button,
				primary ? styles.buttonPrimary : styles.buttonSecondary,
				disabled && styles.buttonDisabled,
				pressed && !disabled && styles.buttonPressed,
			]}
		>
			<Text style={[styles.buttonText, !primary && styles.buttonTextSecondary]}>{label}</Text>
		</Pressable>
	);
}

/**
 * Settings → Export My Data, in two steps: which titles (All / Movies — all, to be watched,
 * upcoming / TV Shows — all, ended, ongoing), then how much of them (all the data, certain
 * parts, or just the list of titles). The sub-options fold open under their row.
 */
export default function ExportSheet({ visible, onClose, onExport }: Readonly<Props>) {
	const [step, setStep] = useState<1 | 2>(1);
	const [scope, setScope] = useState(ExportScope.ALL);
	const [filter, setFilter] = useState(ExportFilter.ALL);
	const [content, setContent] = useState(ExportContent.EVERYTHING);
	const [parts, setParts] = useState<ReadonlySet<ExportPart>>(new Set(EXPORT_TITLE_PARTS));
	// Opens on its first step every time
	useEffect(() => {
		if (visible) setStep(1);
	}, [visible]);

	const pickScope = (next: ExportScope) => {
		if (next !== scope) setFilter(ExportFilter.ALL);
		setScope(next);
	};
	const togglePart = (part: ExportPart) =>
		setParts((prev) => {
			const next = new Set(prev);
			if (next.has(part)) next.delete(part);
			else next.add(part);
			return next;
		});
	const nothingChosen = content === ExportContent.CHOSEN && parts.size === 0;
	const listsOnly = scope === ExportScope.LISTS;
	// Everything's "all the data" is a full backup: the lists go in too
	const contentHint = (c: ExportContent, hint: string) =>
		c === ExportContent.EVERYTHING && scope === ExportScope.ALL
			? "A full backup: progress, watch history and your custom lists"
			: hint;

	return (
		<BottomSheet visible={visible} onClose={onClose}>
			{(close) =>
				step === 1 ? (
					<StepIn key="scope" from={-1}>
						<Text style={styles.step}>{listsOnly ? "EXPORT" : "STEP 1 OF 2"}</Text>
						<Text style={styles.title}>What do you want to export?</Text>
						<SheetGroup>
							{SCOPES.flatMap(({ scope: s, icon, color, title, hint }) => {
								const row = (
									<ChoiceRow
										key={s}
										icon={icon}
										color={color}
										title={title}
										hint={hint}
										on={scope === s}
										onPress={() => pickScope(s)}
									/>
								);
								const filters = EXPORT_FILTERS[s];
								if (filters.length === 0) return [row];
								return [
									row,
									<SheetCollapse key={`${s}-filters`} open={scope === s}>
										{filters.map((f) => (
											<ChoiceRow
												key={f}
												sub
												title={FILTER_LABELS[f][s === ExportScope.MOVIES ? "movies" : "tv"][0]}
												hint={FILTER_LABELS[f][s === ExportScope.MOVIES ? "movies" : "tv"][1]}
												on={filter === f}
												onPress={() => setFilter(f)}
											/>
										))}
									</SheetCollapse>,
								];
							})}
						</SheetGroup>
						<View style={styles.footer}>
							{listsOnly ? (
								// Just lists — nothing to choose about tracking data
								<SheetButton
									primary
									label="Export"
									onPress={() => {
										const options = accountExportOptions(scope, filter, content, parts);
										close(() => onExport(options));
									}}
								/>
							) : (
								<SheetButton primary label="Next" onPress={() => setStep(2)} />
							)}
						</View>
					</StepIn>
				) : (
					<StepIn key="content" from={1}>
						<Text style={styles.step}>STEP 2 OF 2</Text>
						<Text style={styles.title}>What should it include?</Text>
						<SheetGroup>
							{CONTENTS.flatMap(({ content: c, icon, color, title, hint }) => {
								const row = (
									<ChoiceRow
										key={c}
										icon={icon}
										color={color}
										title={title}
										hint={contentHint(c, hint)}
										on={content === c}
										onPress={() => setContent(c)}
									/>
								);
								if (c !== ExportContent.CHOSEN) return [row];
								return [
									row,
									<SheetCollapse key="parts" open={content === ExportContent.CHOSEN}>
										{PARTS.map(({ part, title: partTitle, hint: partHint }) => (
											<ChoiceRow
												key={part}
												sub
												square
												title={partTitle}
												hint={partHint}
												on={parts.has(part)}
												onPress={() => togglePart(part)}
											/>
										))}
									</SheetCollapse>,
								];
							})}
						</SheetGroup>
						<View style={styles.footer}>
							<SheetButton label="Back" onPress={() => setStep(1)} />
							<SheetButton
								primary
								label="Export"
								disabled={nothingChosen}
								onPress={() => {
									const options = accountExportOptions(scope, filter, content, parts);
									close(() => onExport(options));
								}}
							/>
						</View>
					</StepIn>
				)
			}
		</BottomSheet>
	);
}

const MARK = 22;

const styles = themedStyles(() => StyleSheet.create({
	step: {
		...typography.caption,
		fontSize: 11,
		letterSpacing: 1.2,
		color: colors.textMuted,
		marginBottom: spacing.xs,
	},
	title: { ...typography.title, fontSize: 20, marginBottom: spacing.lg },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.md,
	},
	// Sub-options line up under their parent's text (past the 36px icon tile)
	subRow: { paddingLeft: spacing.md + 36 + spacing.md, paddingVertical: spacing.sm + 2 },
	rowPressed: { backgroundColor: colors.border },
	rowContent: { flex: 1 },
	rowText: { ...typography.subtitle, fontSize: 15 },
	subText: { fontSize: 14, fontWeight: "500" },
	rowHint: { ...typography.caption, fontSize: 12, marginTop: 2 },
	mark: {
		width: MARK,
		height: MARK,
		borderRadius: MARK / 2,
		borderWidth: 2,
		borderColor: colors.textMuted,
		alignItems: "center",
		justifyContent: "center",
	},
	markSquare: { borderRadius: 6 },
	markOn: { backgroundColor: colors.primary, borderColor: colors.primary },
	footer: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
	button: {
		flex: 1,
		paddingVertical: spacing.md + 2,
		borderRadius: 12,
		alignItems: "center",
	},
	buttonPrimary: { backgroundColor: colors.primary },
	buttonSecondary: { backgroundColor: colors.surfaceLight },
	buttonDisabled: { opacity: 0.4 },
	// Emil: a press answers at once — a touch smaller
	buttonPressed: { transform: [{ scale: 0.97 }] },
	buttonText: { ...typography.subtitle, fontSize: 15, color: colors.onPrimary },
	buttonTextSecondary: { color: colors.textSecondary },
}));
