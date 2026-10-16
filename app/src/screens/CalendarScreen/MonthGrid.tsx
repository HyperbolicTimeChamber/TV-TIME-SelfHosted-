import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { MediaType } from "../../types";
import { colors } from "../../theme";
import { SUNDAY_COLUMN, planChips } from "../../utils/calendarGrid";
import type { DayMark } from "../../utils/calendarGroups";
import { CalendarMode, ROW_MONTH, styles } from "./calendarStyles";

/** Month view shows this many event bars per day */
const MAX_BARS = 3;
/** Full-view chip text metrics (see chip style) */
export const CHIP_LINE_H = 12;
export const CHIP_GAP = 2;

/** Room for chips in a full-view cell, and how many title characters fit a line */
export interface ChipFit {
	space: number;
	charsPerLine: number;
}

/** Bars fade out / chips fade in toward full view — one pair per grid, shared by its cells */
export type MarkFades = ReturnType<typeof useMarkFades>;

export function useMarkFades(progress: SharedValue<number>) {
	const bars = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [1, 1.5], [1, 0], "clamp") }));
	const chips = useAnimatedStyle(() => ({ opacity: interpolate(progress.value, [1.3, 2], [0, 1], "clamp") }));
	return { bars, chips };
}

const markColor = (m: DayMark) => (m.mediaType === MediaType.MOVIE ? colors.moviePurple : colors.primary);

interface CellProps {
	date: string;
	dimmed: boolean;
	isToday: boolean;
	isSelected: boolean;
	column: number;
	marks: DayMark[] | undefined;
	chipFit: ChipFit;
	/** Chips only exist in (or on the way to) full view */
	showChips: boolean;
	fades: MarkFades;
	onPress: (date: string) => void;
}

/** One day: number, event bars that turn into titled chips in full view */
const DayCell = memo(function DayCell({
	date,
	dimmed,
	isToday,
	isSelected,
	column,
	marks,
	chipFit,
	showChips,
	fades,
	onPress,
}: CellProps) {
	const day = Number(date.slice(8));
	const chipPlan =
		showChips && marks ? planChips(marks, chipFit.space, chipFit.charsPerLine, CHIP_LINE_H, CHIP_GAP) : null;
	return (
		<Pressable style={styles.cell} onPress={() => onPress(date)}>
			{/* Today's red fill already marks it — the selection outline is for other days */}
			<View
				style={[
					styles.tile,
					isToday && styles.tileToday,
					isSelected && !isToday && styles.tileSelected,
					dimmed && styles.dimmed,
				]}
			>
				<View style={styles.dayNumberBox}>
					<Text style={[styles.dayNumber, column === SUNDAY_COLUMN && !isToday && styles.sunday]}>{day}</Text>
				</View>
				{marks && marks.length > 0 && (
					<View style={styles.markArea}>
						<Animated.View style={[styles.bars, fades.bars]}>
							{marks.slice(0, MAX_BARS).map((m) => (
								<View key={m.key} style={[styles.bar, { backgroundColor: markColor(m) }]} />
							))}
						</Animated.View>
						{chipPlan && (
							<Animated.View style={[styles.chips, fades.chips]} pointerEvents="none">
								{chipPlan.shown.map((m) => (
									<Text key={m.key} numberOfLines={2} style={[styles.chip, { backgroundColor: markColor(m) }]}>
										{m.title}
									</Text>
								))}
								{!!chipPlan.more && (
									<Text numberOfLines={1} style={styles.chipMore}>
										+{chipPlan.more} more
									</Text>
								)}
							</Animated.View>
						)}
					</View>
				)}
			</View>
		</Pressable>
	);
});

interface WeekRowProps {
	dates: string[];
	/** Days outside this month are dimmed (null = none, e.g. the week strip) */
	month: string | null;
	today: string;
	selected: string | null;
	marks: Map<string, DayMark[]>;
	chipFit: ChipFit;
	showChips: boolean;
	fades: MarkFades;
	progress: SharedValue<number>;
	/** Full-view row height (shared) */
	fullRowH: SharedValue<number>;
	onDayPress: (date: string) => void;
}

/** A week's 7 cells; its height grows from the month row to the full-view row */
export const WeekRow = memo(function WeekRow({
	dates,
	month,
	today,
	selected,
	marks,
	chipFit,
	showChips,
	fades,
	progress,
	fullRowH,
	onDayPress,
}: WeekRowProps) {
	const row = useAnimatedStyle(() => ({
		height:
			progress.value <= CalendarMode.MONTH
				? ROW_MONTH
				: interpolate(progress.value, [CalendarMode.MONTH, CalendarMode.FULL], [ROW_MONTH, fullRowH.value]),
	}));
	return (
		<Animated.View style={[styles.weekRow, row]}>
			{dates.map((date, column) => (
				<DayCell
					key={date}
					date={date}
					column={column}
					dimmed={month !== null && !date.startsWith(month)}
					isToday={date === today}
					isSelected={date === selected}
					marks={marks.get(date)}
					chipFit={chipFit}
					showChips={showChips}
					fades={fades}
					onPress={onDayPress}
				/>
			))}
		</Animated.View>
	);
});

/** Week strip (week view): one row with its own fade pair */
export function WeekStrip(props: Omit<WeekRowProps, "fades">) {
	const fades = useMarkFades(props.progress);
	return <WeekRow {...props} fades={fades} />;
}

interface MonthGridProps extends Omit<WeekRowProps, "dates" | "month" | "fades"> {
	weeks: string[][];
	/** "YYYY-MM" of the month shown */
	month: string;
	/** Row of the selected day — stays on screen as the month shrinks to a week */
	selectedRow: number;
}

/** Month as week rows; collapsing toward week view slides up to keep the selected row */
export function MonthGrid({ weeks, selectedRow, progress, ...row }: MonthGridProps) {
	const fades = useMarkFades(progress);
	const slide = useAnimatedStyle(() => ({
		transform: [
			{ translateY: progress.value < CalendarMode.MONTH ? -selectedRow * ROW_MONTH * (1 - progress.value) : 0 },
		],
	}));
	return (
		<Animated.View style={slide}>
			{weeks.map((dates) => (
				<WeekRow key={dates[0]} dates={dates} progress={progress} fades={fades} {...row} />
			))}
		</Animated.View>
	);
}
