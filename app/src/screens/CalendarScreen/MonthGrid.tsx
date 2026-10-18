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


/** useAnimatedStyle result shared by every cell */
export type MarksStyle = ReturnType<typeof useAnimatedStyle<{ opacity: number }>>;

const markColor = (m: DayMark) => (m.mediaType === MediaType.MOVIE ? colors.moviePurple : colors.primary);

interface CellProps {
	date: string;
	dimmed: boolean;
	isToday: boolean;
	isSelected: boolean;
	column: number;
	marks: DayMark[] | undefined;
	chipFit: ChipFit;
	/** Bars (week / month) and titled chips (full) are both mounted; these shared opacities
	 *  pick which shows, switched on the UI thread (no re-render when a resize lands) */
	barsStyle: MarksStyle;
	chipsStyle: MarksStyle;
	/** Counter-scale for the day number while its row is stretched (resize) */
	numberStyle: ReturnType<typeof useAnimatedStyle>;
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
	barsStyle,
	chipsStyle,
	numberStyle,
	onPress,
}: CellProps) {
	const day = Number(date.slice(8));
	const chipPlan =
		marks ? planChips(marks, chipFit.space, chipFit.charsPerLine, CHIP_LINE_H, CHIP_GAP) : null;
	return (
		<Pressable style={styles.cell} onPress={() => onPress(date)}>
						<View
				style={[
					styles.tile,
					isToday && styles.tileToday,
					isSelected && styles.tileSelected,
					dimmed && styles.dimmed,
				]}
			>
				<Animated.View style={[styles.dayNumberBox, numberStyle]}>
					<Text style={[styles.dayNumber, column === SUNDAY_COLUMN && !isToday && styles.sunday]}>{day}</Text>
				</Animated.View>
				{marks && marks.length > 0 && (
					<View style={styles.markArea}>
						<Animated.View style={[styles.bars, barsStyle]}>
							{marks.slice(0, MAX_BARS).map((m) => (
								<View key={m.key} style={[styles.bar, { backgroundColor: markColor(m) }]} />
							))}
						</Animated.View>
						{chipPlan && (
							<Animated.View style={[styles.chips, chipsStyle]} pointerEvents="none">
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
	barsStyle: MarksStyle;
	chipsStyle: MarksStyle;
	/** Resize progress — only the page on screen gets it: offscreen neighbours rest at their
	 *  layout height and don't recompute styles on every resize frame */
	progress?: SharedValue<number>;
	/** Full-view row height (shared) */
	fullRowH: SharedValue<number>;
	/** Row position in its month (for stacking while stretched) */
	rowIndex?: number;
	/** Rows rest at the full-view height (full mode) instead of the month height — a shared
	 *  value so it flips on the UI thread in the same frame the resize lands */
	fullLayout?: SharedValue<boolean>;
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
	barsStyle,
	chipsStyle,
	progress,
	fullRowH,
	rowIndex = 0,
	fullLayout,
	onDayPress,
}: WeekRowProps) {
	// Height in layout never animates (that relaid the whole grid out every frame): the row
	// rests at the month or full height and is stretched / squashed from its top with scaleY,
	// shifted by translateY so rows stay stacked. GPU-only during the drag.
	const rowStyle = useAnimatedStyle(() => {
		const base = fullLayout?.value ? fullRowH.value : ROW_MONTH;
		if (!progress) return { height: base, transform: [] };
		const target =
			progress.value <= CalendarMode.MONTH
				? ROW_MONTH
				: interpolate(progress.value, [CalendarMode.MONTH, CalendarMode.FULL], [ROW_MONTH, fullRowH.value]);
		return {
			height: base,
			transformOrigin: "top",
			transform: [{ translateY: rowIndex * (target - base) }, { scaleY: target / base }],
		};
	});
	// Day numbers keep their shape inside a stretched row
	const numberStyle = useAnimatedStyle(() => {
		if (!progress) return { transform: [] };
		const target =
			progress.value <= CalendarMode.MONTH
				? ROW_MONTH
				: interpolate(progress.value, [CalendarMode.MONTH, CalendarMode.FULL], [ROW_MONTH, fullRowH.value]);
		const base = fullLayout?.value ? fullRowH.value : ROW_MONTH;
		return { transformOrigin: "top", transform: [{ scaleY: base / target }] };
	});
	return (
		<Animated.View style={[styles.weekRow, rowStyle]}>
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
					barsStyle={barsStyle}
					chipsStyle={chipsStyle}
					numberStyle={numberStyle}
					onPress={onDayPress}
				/>
			))}
		</Animated.View>
	);
});

interface MonthGridProps extends Omit<WeekRowProps, "dates" | "month"> {
	weeks: string[][];
	/** "YYYY-MM" of the month shown */
	month: string;
	/** Row of the selected day — stays on screen as the month shrinks to a week */
	selectedRow: number;
}

/** Month as week rows; collapsing toward week view slides up to keep the selected row */
export function MonthGrid({ weeks, selectedRow, progress, ...row }: MonthGridProps) {
	const slide = useAnimatedStyle(() => ({
		transform: [
			{
				translateY:
					progress && progress.value < CalendarMode.MONTH ? -selectedRow * ROW_MONTH * (1 - progress.value) : 0,
			},
		],
	}));
	return (
		<Animated.View style={slide}>
			{weeks.map((dates, i) => (
				<WeekRow key={dates[0]} dates={dates} progress={progress} rowIndex={i} {...row} />
			))}
		</Animated.View>
	);
}
