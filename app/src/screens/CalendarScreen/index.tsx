import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Animated as RNAnimated, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LegendList } from "@legendapp/list/react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	interpolate,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";
import { AnimatedModal, EpisodeDetailModal } from "../../components";
import { useSharedShimmer } from "../../components/SkeletonLine";
import { getCachedCatalogShow } from "../../hooks";
import { CalendarStackParamList, Route, MediaType } from "../../types";
import { useCalendarScreen, YEARS, type CalendarEpisode } from "../useCalendarScreen";
import { calendarEpisodeInfo } from "../../utils/calendarGroups";
import {
	WEEKDAY_LABELS,
	addDays,
	monthWeeks,
	parseDay,
	shiftMonth,
	weekDates,
	weekStart,
} from "../../utils/calendarGrid";
import { todayStr } from "../../utils/todayStr";
import Pager from "./Pager";
import DayList from "./DayList";
import { MonthGrid, WeekRow } from "./MonthGrid";
import { CalendarMode, ROW_MONTH, styles } from "./calendarStyles";

type NavProp = NativeStackNavigationProp<CalendarStackParamList, Route.CALENDAR_MAIN>;

const SKELETON_CARDS = 3;
const RESIZE_MS = 240;
/** How far a release's speed carries the resize when picking the view to snap to */
const FLING_CARRY = 0.15;
// Read-only episode info: nothing to mark
const NO_WATCHED = new Map<string, number>();
const noopAsync = async () => {};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Day list placeholder: date line + cards, pulsing on the shared shimmer */
function CalendarSkeleton() {
	const shimmer = useSharedShimmer();
	return (
		<View>
			<RNAnimated.View style={[styles.skeletonHeader, { opacity: shimmer }]} />
			{Array.from({ length: SKELETON_CARDS }, (_, i) => (
				<RNAnimated.View key={i} style={[styles.skeletonCard, { opacity: shimmer }]} />
			))}
		</View>
	);
}

/** "15 THU" */
function DayHeader({ date }: { date: string }) {
	const weekday = parseDay(date).toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
	return (
		<View style={styles.dayHeader}>
			<Text style={styles.dayHeaderNumber}>{Number(date.slice(8))}</Text>
			<Text style={styles.dayHeaderWeekday}>{weekday}</Text>
		</View>
	);
}

/**
 * Calendar (Samsung Calendar layout): month grid with event bars over the day's cards.
 * Swipe the calendar sideways for months (weeks in week view), up/down to shrink it to a
 * week strip or grow it to a full-screen month with titled events; swipe the list sideways
 * for the previous / next day.
 */
export default function CalendarScreen() {
	const { top } = useSafeAreaInsets();
	const { width, height: windowH } = useWindowDimensions();
	const navigation = useNavigation<NavProp>();
	const yearListRef = useRef<any>(null);
	const c = useCalendarScreen();
	const { selectDate, handleMonthChange, episodesForDate, dayMarks, currentYear, currentMonth } = c;
	const selected = c.selectedDate ?? todayStr();
	const today = todayStr();
	// Skeleton only until the shown month has data — preloading neighbours shouldn't flash it
	const monthKey = `${currentYear}-${pad2(currentMonth)}`;
	const monthLoading = c.loading && !(c.episodes ?? []).some((ep) => ep.airDate.startsWith(monthKey));

	// Back to today only when the Calendar tab is entered — not when returning from a
	// show page pushed inside this tab (that's a focus of this screen, not of the tab)
	useEffect(() => navigation.getParent()?.addListener("focus", c.resetToToday), [navigation, c.resetToToday]);
	// Groups start closed whenever the user comes back to this screen
	const [collapseSignal, setCollapseSignal] = useState(0);
	useEffect(() => navigation.addListener("blur", () => setCollapseSignal((n) => n + 1)), [navigation]);

	// --- View size: week strip / month / full, animated through `progress` ---------------
	const [mode, setMode] = useState(CalendarMode.MONTH);
	// While resizing from the week strip the month grid stands in (it collapses to a row)
	const [resizing, setResizing] = useState(false);
	const progress = useSharedValue<number>(CalendarMode.MONTH);
	const bodyH = useSharedValue(0);
	const startH = useSharedValue(0);
	const weeks = useMemo(() => monthWeeks(currentYear, currentMonth), [currentYear, currentMonth]);
	const rows = useSharedValue(weeks.length);
	const fullRowH = useSharedValue(ROW_MONTH);
	useEffect(() => {
		rows.value = weeks.length;
		if (bodyH.value > 0) fullRowH.value = bodyH.value / weeks.length;
	}, [weeks.length, rows, bodyH, fullRowH]);
	const selectedRow = Math.max(0, weeks.findIndex((w) => w.includes(selected)));

	const settle = useCallback((next: CalendarMode) => {
		setMode(next);
		setResizing(false);
	}, []);

	// Height of the calendar for a progress value, and back
	const heightAt = (p: number, r: number, full: number) => {
		"worklet";
		const monthH = r * ROW_MONTH;
		return p <= CalendarMode.MONTH
			? ROW_MONTH + (monthH - ROW_MONTH) * p
			: monthH + (full - monthH) * (p - CalendarMode.MONTH);
	};
	const progressAt = (h: number, r: number, full: number) => {
		"worklet";
		const monthH = r * ROW_MONTH;
		return h <= monthH
			? (h - ROW_MONTH) / Math.max(1, monthH - ROW_MONTH)
			: CalendarMode.MONTH + (h - monthH) / Math.max(1, full - monthH);
	};

	// Vertical drag on the calendar (or a day header) resizes; release snaps to the nearest view
	const makeResize = () =>
		Gesture.Pan()
			.activeOffsetY([-12, 12])
			.failOffsetX([-12, 12])
			.onStart(() => {
				startH.value = heightAt(progress.value, rows.value, bodyH.value);
				runOnJS(setResizing)(true);
			})
			.onUpdate((e) => {
				const h = Math.min(Math.max(startH.value + e.translationY, ROW_MONTH), bodyH.value);
				progress.value = progressAt(h, rows.value, bodyH.value);
			})
			.onEnd((e) => {
				const landing = heightAt(progress.value, rows.value, bodyH.value) + e.velocityY * FLING_CARRY;
				const stops = [CalendarMode.WEEK, CalendarMode.MONTH, CalendarMode.FULL];
				let target = CalendarMode.MONTH;
				let best = Infinity;
				for (const s of stops) {
					const d = Math.abs(heightAt(s, rows.value, bodyH.value) - landing);
					if (d < best) {
						best = d;
						target = s;
					}
				}
				progress.value = withTiming(target, { duration: RESIZE_MS }, () => runOnJS(settle)(target));
			});
	const calendarResize = makeResize();

	const calendarStyle = useAnimatedStyle(() => ({ height: heightAt(progress.value, rows.value, bodyH.value) }));
	const listStyle = useAnimatedStyle(() => ({
		opacity: interpolate(progress.value, [CalendarMode.MONTH, CalendarMode.FULL - 0.3], [1, 0], "clamp"),
	}));

	// --- Pages -----------------------------------------------------------------------------
	const weekPaging = mode === CalendarMode.WEEK && !resizing;
	const [popupDate, setPopupDate] = useState<string | null>(null);

	const onDayPress = useCallback(
		(date: string) => {
			selectDate(date);
			// Full view has no list — the day opens in a popup instead
			if (mode === CalendarMode.FULL) setPopupDate(date);
		},
		[selectDate, mode],
	);

	const renderCalendarPage = (offset: -1 | 0 | 1) => {
		if (weekPaging) {
			return (
				<WeekRow
					dates={weekDates(addDays(selected, offset * 7))}
					month={null}
					today={today}
					selected={selected}
					marks={dayMarks}
					progress={progress}
					fullRowH={fullRowH}
					onDayPress={onDayPress}
				/>
			);
		}
		const { year, month } = shiftMonth(currentYear, currentMonth, offset);
		return (
			<MonthGrid
				weeks={offset === 0 ? weeks : monthWeeks(year, month)}
				month={`${year}-${pad2(month)}`}
				selectedRow={offset === 0 ? selectedRow : 0}
				today={today}
				selected={selected}
				marks={dayMarks}
				progress={progress}
				fullRowH={fullRowH}
				onDayPress={onDayPress}
			/>
		);
	};

	const onCalendarPage = useCallback(
		(dir: 1 | -1) => {
			if (weekPaging) selectDate(addDays(selected, dir * 7));
			else {
				const m = shiftMonth(currentYear, currentMonth, dir);
				handleMonthChange(m.year, m.month);
			}
		},
		[weekPaging, selectDate, selected, currentYear, currentMonth, handleMonthChange],
	);

	// --- Episode info / movie page -----------------------------------------------------------
	const [infoEp, setInfoEp] = useState<CalendarEpisode | null>(null);
	const infoCatalog = infoEp ? getCachedCatalogShow(infoEp.tmdbShowId, MediaType.TV) : null;
	const infoEpisodes = useMemo(
		() => (infoEp ? [calendarEpisodeInfo(infoEp, infoCatalog)] : []),
		[infoEp, infoCatalog],
	);
	const openMovie = useCallback(
		(ep: CalendarEpisode) => {
			setPopupDate(null);
			navigation.navigate(Route.SHOW_DETAIL, { tmdbId: ep.tmdbShowId, mediaType: MediaType.MOVIE });
		},
		[navigation],
	);

	const dayList = (date: string, fitContent = false) => (
		<DayList
			episodes={episodesForDate(date)}
			onOpenEpisode={setInfoEp}
			onOpenMovie={openMovie}
			collapseSignal={collapseSignal}
			fitContent={fitContent}
		/>
	);

	const renderDayPage = (offset: -1 | 0 | 1) => {
		const date = addDays(selected, offset);
		return (
			<View style={styles.body}>
				<GestureDetector gesture={makeResize()}>
					<View>
						<DayHeader date={date} />
					</View>
				</GestureDetector>
				{dayList(date)}
			</View>
		);
	};

	const openYearModal = useCallback(() => {
		c.setYearModalVisible(true);
		setTimeout(() => {
			const idx = YEARS.indexOf(currentYear);
			if (idx >= 0) yearListRef.current?.scrollToIndex({ index: idx, animated: false, viewPosition: 0.4 });
		}, 100);
	}, [c, currentYear]);

	const monthName = new Date(currentYear, currentMonth - 1).toLocaleDateString("en-US", { month: "short" }).toUpperCase();
	const title = currentYear === new Date().getFullYear() ? monthName : `${monthName} ${currentYear}`;

	return (
		<View style={[styles.container, { paddingTop: top }]}>
			<View style={styles.header}>
				<TouchableOpacity onPress={openYearModal}>
					<Text style={styles.monthTitle}>{title}</Text>
				</TouchableOpacity>
				{/* Today: a calendar-page icon showing today's date */}
				<TouchableOpacity style={styles.todayButton} onPress={c.resetToToday} accessibilityLabel="Go to today">
					<Text style={styles.todayButtonText}>{Number(today.slice(8))}</Text>
				</TouchableOpacity>
			</View>
			<View style={styles.weekdays}>
				{WEEKDAY_LABELS.map((d, i) => (
					<Text key={i} style={[styles.weekday, i === 6 && styles.sunday]}>
						{d}
					</Text>
				))}
			</View>

			<View
				style={styles.body}
				onLayout={(e) => {
					bodyH.value = e.nativeEvent.layout.height;
					fullRowH.value = e.nativeEvent.layout.height / weeks.length;
				}}
			>
				<Animated.View style={[styles.calendar, calendarStyle]}>
					<Pager
						width={width}
						pageKey={weekPaging ? `w${weekStart(selected)}` : `m${currentYear}-${currentMonth}`}
						renderPage={renderCalendarPage}
						onPage={onCalendarPage}
						race={calendarResize}
						style={styles.body}
					/>
				</Animated.View>

				<Animated.View style={[styles.listArea, listStyle]}>
					{monthLoading ? (
						<CalendarSkeleton />
					) : (
						<Pager
							width={width}
							pageKey={selected}
							renderPage={renderDayPage}
							onPage={(dir) => selectDate(addDays(selected, dir))}
							style={styles.body}
						/>
					)}
				</Animated.View>
			</View>

			{/* Full view: tapping a day shows its cards in a popup */}
			<AnimatedModal visible={!!popupDate} onClose={() => setPopupDate(null)} wide>
				{popupDate && (
					<View style={[styles.dayPopup, { maxHeight: windowH * 0.75 }]}>
						<DayHeader date={popupDate} />
						{dayList(popupDate, true)}
					</View>
				)}
			</AnimatedModal>

			{infoEp && (
				<EpisodeDetailModal
					visible
					readOnly
					tmdbId={infoEp.tmdbShowId}
					showTitle={infoEp.showTitle}
					showPosterPath={infoEp.posterPath}
					showBackdropPath={infoEp.backdropPath}
					episodes={infoEpisodes}
					initialIndex={0}
					watchedKeys={NO_WATCHED}
					currentNextEpisode={null}
					onMarkWatched={noopAsync}
					onMarkWatchedThrough={noopAsync}
					onUnmarkWatched={noopAsync}
					onShowPress={() => {
						setInfoEp(null);
						setPopupDate(null);
						navigation.navigate(Route.SHOW_DETAIL, { tmdbId: infoEp.tmdbShowId, mediaType: MediaType.TV });
					}}
					onClose={() => setInfoEp(null)}
				/>
			)}

			{/* Year picker modal */}
			<AnimatedModal visible={c.yearModalVisible} onClose={() => c.setYearModalVisible(false)}>
				<View style={styles.modalContent}>
					<Text style={styles.modalTitle}>Select Year</Text>
					<LegendList
						ref={yearListRef}
						data={YEARS}
						keyExtractor={(item) => String(item)}
						renderItem={({ item }) => (
							<TouchableOpacity
								style={[styles.yearItem, item === currentYear && styles.yearItemActive]}
								onPress={() => c.selectYear(item)}
							>
								<Text style={[styles.yearItemText, item === currentYear && styles.yearItemTextActive]}>
									{item}
								</Text>
							</TouchableOpacity>
						)}
						showsVerticalScrollIndicator={false}
						style={styles.yearList}
						snapToInterval={52}
						decelerationRate="fast"
					/>
				</View>
			</AnimatedModal>
		</View>
	);
}
