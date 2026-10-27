import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	AppState,
	View,
	Text,
	TouchableOpacity,
	StyleSheet,
	Animated as RNAnimated,
	useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LegendList } from "@legendapp/list/react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
	interpolate,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withDecay,
	withTiming,
} from "react-native-reanimated";
import { AnimatedModal, EpisodeDetailModal } from "../../components";
import { useSharedShimmer } from "../../components/SkeletonLine";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { CARD_WIDTH as INFO_CARD_W } from "../../components/modals/EpisodeDetailModal/constants";
import { getCachedCatalogShow, loadSeasonEpisodes, useEpisodeInfoLoader } from "../../hooks";
import { tmdbBackdropUri, tmdbStillUri } from "../../hooks/useTmdbImage";
import { CalendarStackParamList, Route, MediaType } from "../../types";
import { useCalendarScreen, YEARS, type CalendarEpisode } from "../useCalendarScreen";
import { calendarEpisodeInfo } from "../../utils/calendarGroups";
import {
	WEEKDAY_LABELS,
	addDays,
	dayNumber,
	monthWeeks,
	parseDay,
	shiftMonth,
	weekDates,
	weekStart,
} from "../../utils/calendarGrid";
import { todayStr } from "../../utils/todayStr";
import { useTabPress } from "../../navigation/CustomTabBar";
import Pager from "./Pager";
import DayList from "./DayList";
import { MonthGrid, WeekRow, type ChipFit } from "./MonthGrid";
import { CalendarMode, ROW_MONTH, styles } from "./calendarStyles";

type NavProp = NativeStackNavigationProp<CalendarStackParamList, Route.CALENDAR_MAIN>;

const SKELETON_CARDS = 3;
const RESIZE_MS = 240;
const MARKS_IN_MS = 100;
/** Day settled this long before its info cards are warmed (seasons + stills) */
const INFO_WARM_DELAY_MS = 400;
/** New day's cards slide in over this, from this far out */
const DAY_SWAP_MS = 200;
const DAY_SWAP_PX = 36;
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

/** "15 THURSDAY" */
function DayHeader({ date }: { date: string }) {
	const weekday = parseDay(date).toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
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
	const {
		selectDate,
		handleMonthChange,
		episodesForDate,
		dayMarks,
		currentYear,
		currentMonth,
		resetToToday,
	} = c;
	const selected = c.selectedDate ?? todayStr();
	const today = todayStr();

	// Back to today on a Calendar tab-button press or when the app comes back — deliberately
	// not on tab focus: reaching Calendar by swiping would jump the date out from under the
	// swipe. (Returning from a show page pushed inside this tab must not reset it either.)
	useTabPress((route) => {
		if (route === Route.CALENDAR) resetToToday();
	});
	useEffect(() => {
		const sub = AppState.addEventListener("change", (state) => {
			if (state === "active") resetToToday();
		});
		return () => sub.remove();
	}, [resetToToday]);
	// Groups start closed whenever the user comes back to this screen
	const [collapseSignal, setCollapseSignal] = useState(0);
	useEffect(
		() => navigation.addListener("blur", () => setCollapseSignal((n) => n + 1)),
		[navigation],
	);

	// --- View size: week strip / month / full, animated through `progress` ---------------
	const [mode, setMode] = useState(CalendarMode.MONTH);
	const progress = useSharedValue<number>(CalendarMode.MONTH);
	const bodyH = useSharedValue(0);
	const weeks = useMemo(() => monthWeeks(currentYear, currentMonth), [currentYear, currentMonth]);
	const rows = useSharedValue(weeks.length);
	const fullRowH = useSharedValue(ROW_MONTH);
	// Full-view cell size in JS too — decides which event chips fit
	const [bodyPx, setBodyPx] = useState(0);
	const chipFit = useMemo((): ChipFit => {
		// Row minus the day number area (cell padding, tile padding + border, number, gap)
		const space = bodyPx / weeks.length - (3 + 6 + 20 + 3);
		// Cell inner width at ~5px per 9px character
		const cellW = (width - 8) / 7 - 3 - 2 - 4 - 4;
		return { space: Math.max(0, space), charsPerLine: Math.max(4, Math.floor(cellW / 5)) };
	}, [bodyPx, weeks.length, width]);
	// Before paint, not after: a month with a different number of weeks was otherwise drawn
	// for one frame at the previous month's row height — the jump seen when swiping months
	useLayoutEffect(() => {
		rows.value = weeks.length;
		if (bodyH.value > 0) fullRowH.value = bodyH.value / weeks.length;
	}, [weeks.length, rows, bodyH, fullRowH]);
	const selectedRow = Math.max(
		0,
		weeks.findIndex((w) => w.includes(selected)),
	);

	const settle = useCallback((next: CalendarMode) => setMode(next), []);

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

	// --- One scroll for the whole screen ------------------------------------------------------
	// Finger up: the calendar shrinks to the week strip first, then the day list scrolls.
	// Finger down: the list scrolls back to its top first, then the calendar grows (month →
	// full). Same on the calendar and on the list. Release: a calendar caught between sizes
	// snaps to the nearest; otherwise the list keeps the fling.
	const listY = useSharedValue(0);
	const contentH = useSharedValue(0);
	const lastT = useSharedValue(0);
	// Bars (week / month) and titled chips (full) are both always mounted; two shared opacities
	// pick which shows. Between month and full both hide (the rows are being stretched) and
	// the right one fades back in the instant the resize lands — all on the UI thread, no
	// re-render (remounting waits on JS: up to ~1.5s on a slow phone)
	const barsOpacity = useSharedValue(1);
	const chipsOpacity = useSharedValue(0);
	const marksHidden = useSharedValue(false);
	// Rows rest at full height in full mode (switched on the UI thread when a resize lands)
	const fullLayout = useSharedValue(false);
	const syncMarks = (settled: boolean) => {
		"worklet";
		const hide = !settled && progress.value > CalendarMode.MONTH + 0.001;
		if (hide) {
			if (marksHidden.value) return;
			marksHidden.value = true;
			// Instantly: a fade would show them stretched with the rows
			barsOpacity.value = 0;
			chipsOpacity.value = 0;
			return;
		}
		if (!marksHidden.value && !settled) return;
		marksHidden.value = false;
		const full = fullLayout.value;
		barsOpacity.value = full ? 0 : withTiming(1, { duration: MARKS_IN_MS });
		chipsOpacity.value = full ? withTiming(1, { duration: MARKS_IN_MS }) : 0;
	};
	const barsStyle = useAnimatedStyle(() => ({ opacity: barsOpacity.value }));
	const chipsStyle = useAnimatedStyle(() => ({ opacity: chipsOpacity.value }));
	const listMax = () => {
		"worklet";
		const viewport = bodyH.value - heightAt(progress.value, rows.value, bodyH.value);
		return Math.max(0, contentH.value - viewport);
	};
	const makeScroll = () =>
		Gesture.Pan()
			.activeOffsetY([-10, 10])
			.failOffsetX([-12, 12])
			.onStart(() => {
				"worklet";
				lastT.value = 0;
			})
			.onUpdate((e) => {
				"worklet";
				let delta = e.translationY - lastT.value;
				lastT.value = e.translationY;
				const h = heightAt(progress.value, rows.value, bodyH.value);
				if (delta < 0) {
					// Up: shrink the calendar, the rest scrolls the list
					const shrink = Math.max(delta, ROW_MONTH - h);
					if (shrink < 0) progress.value = progressAt(h + shrink, rows.value, bodyH.value);
					delta -= shrink;
					if (delta < 0) listY.value = Math.min(listMax(), listY.value - delta);
				} else if (delta > 0) {
					// Down: list back to the top, the rest grows the calendar
					const back = Math.min(delta, listY.value);
					listY.value -= back;
					delta -= back;
					if (delta > 0)
						progress.value = progressAt(Math.min(bodyH.value, h + delta), rows.value, bodyH.value);
				}
				syncMarks(false);
			})
			.onEnd((e) => {
				"worklet";
				const p = progress.value;
				const atStop = Math.abs(p - Math.round(p)) < 0.01;
				if (atStop) {
					const stop = Math.round(p) as CalendarMode;
					progress.value = stop;
					fullLayout.value = stop === CalendarMode.FULL;
					syncMarks(true);
					runOnJS(settle)(stop);
					// Week strip (or month with a long day) — the list keeps the fling
					listY.value = withDecay({ velocity: -e.velocityY, clamp: [0, listMax()] });
					return;
				}
				const landing = heightAt(p, rows.value, bodyH.value) + e.velocityY * FLING_CARRY;
				let target = CalendarMode.MONTH;
				let best = Infinity;
				for (const s of [CalendarMode.WEEK, CalendarMode.MONTH, CalendarMode.FULL]) {
					const d = Math.abs(heightAt(s, rows.value, bodyH.value) - landing);
					if (d < best) {
						best = d;
						target = s;
					}
				}
				// Marks come back the moment it lands (rows are stretched until then)
				progress.value = withTiming(target, { duration: RESIZE_MS }, () => {
					fullLayout.value = target === CalendarMode.FULL;
					syncMarks(true);
					runOnJS(settle)(target);
				});
			});
	// Built once — rebuilding a gesture mid-drag (the drag itself re-renders) loses its callbacks
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const calendarScroll = useMemo(() => makeScroll(), []);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	const listScrollGesture = useMemo(() => makeScroll(), []);
	// Each day page's height, by date. A day swiped in keeps its views (the pager keys pages by
	// date), so it fires no new layout event as it becomes the selected day — its height is
	// looked up here instead, else the scroll limit stays the previous day's
	const pageH = useRef(new Map<string, number>());
	const selectedRef = useRef(selected);
	selectedRef.current = selected;
	const onDayPageLayout = useCallback(
		(date: string, h: number) => {
			pageH.current.set(date, h);
			if (date === selectedRef.current) contentH.value = h;
		},
		[contentH],
	);
	// New day → its list starts at the top (the calendar keeps its size), scrolling its own height
	useLayoutEffect(() => {
		listY.value = 0;
		contentH.value = pageH.current.get(selected) ?? 0;
	}, [selected, listY, contentH]);
	const listScroll = useAnimatedStyle(() => ({ transform: [{ translateY: -listY.value }] }));

	// Resizing is transform-only: the calendar keeps its full height and the day list — an opaque
	// layer on top — slides down/up to uncover it. Animating the height would relayout the
	// whole screen every frame (janky on real phones, e.g. an S21).
	const listStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: heightAt(progress.value, rows.value, bodyH.value) }],
		opacity: interpolate(
			progress.value,
			[CalendarMode.MONTH, CalendarMode.FULL - 0.3],
			[1, 0],
			"clamp",
		),
	}));

	// --- Pages -----------------------------------------------------------------------------
	const weekPaging = mode === CalendarMode.WEEK;
	// Week strip hides the instant a pull-down starts: the month grid already mounted under it
	// takes over on the UI thread (no wait for a JS re-render to swap it in)
	const weekStripStyle = useAnimatedStyle(() => ({ opacity: progress.value > 0.001 ? 0 : 1 }));
	const [popupDate, setPopupDate] = useState<string | null>(null);

	const popupDateRef = useRef<string | null>(null);
	popupDateRef.current = popupDate;
	const closePopup = useCallback(() => {
		if (popupDateRef.current) selectDate(popupDateRef.current);
		setPopupDate(null);
	}, [selectDate]);

	// The list no longer swipes between days (that stole the sideways drag the bottom tabs
	// need). A tapped date's cards slide in instead, from the side the new day lies on.
	const daySwap = useSharedValue(0);
	const prevSelected = useRef(selected);
	useEffect(() => {
		if (prevSelected.current === selected) return;
		const from = selected > prevSelected.current ? DAY_SWAP_PX : -DAY_SWAP_PX;
		prevSelected.current = selected;
		daySwap.value = from;
		daySwap.value = withTiming(0, { duration: DAY_SWAP_MS });
	}, [selected, daySwap]);
	const daySwapStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: daySwap.value }],
		opacity: interpolate(Math.abs(daySwap.value), [0, DAY_SWAP_PX], [1, 0], "clamp"),
	}));

	// Mode read through a ref: a mode change must not hand every day cell a new onPress
	// (that would re-render all three grids the moment a resize lands)
	const modeRef = useRef(mode);
	modeRef.current = mode;
	const onDayPress = useCallback(
		(date: string) => {
			selectDate(date);
			// Full view has no list — the day opens in a popup instead
			if (modeRef.current === CalendarMode.FULL) setPopupDate(date);
		},
		[selectDate],
	);
	// Neighbour months' weeks kept stable so their grids skip re-renders
	const prevMonth = shiftMonth(currentYear, currentMonth, -1);
	const nextMonth = shiftMonth(currentYear, currentMonth, 1);
	const prevWeeks = useMemo(
		() => monthWeeks(prevMonth.year, prevMonth.month),
		[prevMonth.year, prevMonth.month],
	);
	const nextWeeks = useMemo(
		() => monthWeeks(nextMonth.year, nextMonth.month),
		[nextMonth.year, nextMonth.month],
	);

	const monthPage = (offset: -1 | 0 | 1) => {
		const { year, month } = shiftMonth(currentYear, currentMonth, offset);
		return (
			<MonthGrid
				weeks={offset === 0 ? weeks : offset < 0 ? prevWeeks : nextWeeks}
				month={`${year}-${pad2(month)}`}
				selectedRow={offset === 0 ? selectedRow : 0}
				fullLayout={fullLayout}
				today={today}
				selected={selected}
				marks={dayMarks}
				chipFit={chipFit}
				barsStyle={barsStyle}
				chipsStyle={chipsStyle}
				progress={offset === 0 ? progress : undefined}
				fullRowH={fullRowH}
				onDayPress={onDayPress}
			/>
		);
	};
	const renderCalendarPage = (offset: -1 | 0 | 1) => {
		if (!weekPaging) return monthPage(offset);
		const strip = (
			<WeekRow
				dates={weekDates(addDays(selected, offset * 7))}
				month={null}
				today={today}
				selected={selected}
				marks={dayMarks}
				chipFit={chipFit}
				barsStyle={barsStyle}
				chipsStyle={chipsStyle}
				progress={offset === 0 ? progress : undefined}
				fullRowH={fullRowH}
				onDayPress={onDayPress}
			/>
		);
		if (offset !== 0) return strip;
		// The month sits under the strip, collapsed to the same row: a pull-down grows it at once
		return (
			<>
				{monthPage(0)}
				<Animated.View style={[StyleSheet.absoluteFill, weekStripStyle]}>{strip}</Animated.View>
			</>
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
	// Overview / still from TMDB, as the Watch List's info modal loads them
	const loadEpisodeDetails = useEpisodeInfoLoader(infoEp?.tmdbShowId);
	// Warm the selected day's info cards: their seasons (query-cached, the loader above then hits
	// the cache) and stills (image cache), so a tapped card opens with its screenshot instead of
	// waiting on both in turn. Settled days only — swiping through days doesn't fire requests
	const queryClient = useQueryClient();
	const selectedEpisodes = useMemo(() => episodesForDate(selected), [episodesForDate, selected]);
	useEffect(() => {
		const tv = selectedEpisodes.filter((ep) => ep.mediaType === MediaType.TV);
		if (tv.length === 0) return;
		let cancelled = false;
		const timer = setTimeout(() => {
			const bySeason = new Map<string, CalendarEpisode[]>();
			for (const ep of tv) {
				const key = `${ep.tmdbShowId}_${ep.season}`;
				bySeason.set(key, [...(bySeason.get(key) ?? []), ep]);
			}
			for (const eps of bySeason.values()) {
				loadSeasonEpisodes(queryClient, eps[0].tmdbShowId, eps[0].season).then((season) => {
					if (cancelled) return;
					// The card's image: the still, else (not aired yet) the backdrop it falls back to
					const urls = eps
						.map((ep) => {
							const still = season?.find((s) => s.episode === ep.episode)?.stillPath;
							if (still) return tmdbStillUri(still, INFO_CARD_W);
							return ep.backdropPath ? tmdbBackdropUri(ep.backdropPath, INFO_CARD_W) : null;
						})
						.filter((url): url is string => !!url);
					if (urls.length) Image.prefetch(urls);
				});
			}
		}, INFO_WARM_DELAY_MS);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [selectedEpisodes, queryClient]);
	const openMovie = useCallback(
		(ep: CalendarEpisode) => {
			closePopup();
			navigation.navigate(Route.SHOW_DETAIL, { tmdbId: ep.tmdbShowId, mediaType: MediaType.MOVIE });
		},
		[navigation, closePopup],
	);

	// --- Full-view day popup: swipes sideways through the days, like the list under the month ---
	// Most of the window, leaving the backdrop visible around it; capped on tall screens
	const popupMaxH = Math.min(windowH * 0.65, 640);
	// AnimatedModal's wide box (92%, at most 560) less the popup border
	const popupW = Math.min(width * 0.92, 560) - 2;
	// Only the popup's own date moves while it's open: selecting the day as well re-rendered
	// the three month grids and the day list in the middle of every slide (the stutter).
	// The selection catches up when the popup closes.
	const onPopupPage = useCallback((dir: 1 | -1) => {
		setPopupDate((cur) => (cur ? addDays(cur, dir) : cur));
	}, []);
	const renderPopupPage = (offset: -1 | 0 | 1) => {
		if (!popupDate) return null;
		const date = addDays(popupDate, offset);
		// Fills the popup's fixed height: the list scrolls inside it, an empty day centres in it
		return (
			<View style={styles.popupPage}>
				<DayHeader date={date} />
				<DayList
					episodes={episodesForDate(date)}
					onOpenEpisode={setInfoEp}
					onOpenMovie={openMovie}
					collapseSignal={collapseSignal}
					lite={offset !== 0}
				/>
			</View>
		);
	};

	// List space under the month grid: an empty day centres in it in month view, and keeps the same
	// spot (riding up with the list) when the grid shrinks to a week
	const visibleListH = Math.max(0, bodyPx - weeks.length * ROW_MONTH);
	const dayPage = (
		<Animated.View
			// At least the visible list height, so an empty day can centre in it
			style={[{ minHeight: visibleListH }, listScroll]}
			onLayout={(e) => onDayPageLayout(selected, e.nativeEvent.layout.height)}
		>
			<DayHeader date={selected} />
			<DayList
				episodes={episodesForDate(selected)}
				onOpenEpisode={setInfoEp}
				onOpenMovie={openMovie}
				collapseSignal={collapseSignal}
				externalScroll
			/>
		</Animated.View>
	);

	const openYearModal = useCallback(() => {
		c.setYearModalVisible(true);
		setTimeout(() => {
			const idx = YEARS.indexOf(currentYear);
			if (idx >= 0)
				yearListRef.current?.scrollToIndex({ index: idx, animated: false, viewPosition: 0.4 });
		}, 100);
	}, [c, currentYear]);

	const monthName = new Date(currentYear, currentMonth - 1)
		.toLocaleDateString("en-US", { month: "long" })
		.toUpperCase();
	const title =
		currentYear === new Date().getFullYear() ? monthName : `${monthName} ${currentYear}`;

	return (
		<View style={[styles.container, { paddingTop: top }]}>
			<View style={styles.header}>
				<TouchableOpacity onPress={openYearModal}>
					<Text style={styles.monthTitle}>{title}</Text>
				</TouchableOpacity>
				{/* Today: a calendar-page icon showing today's date */}
				<TouchableOpacity
					style={styles.todayButton}
					onPress={c.resetToToday}
					accessibilityLabel="Go to today"
				>
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
					setBodyPx(e.nativeEvent.layout.height);
					fullRowH.value = e.nativeEvent.layout.height / weeks.length;
				}}
			>
				<View style={[styles.calendar, { height: bodyPx }]}>
					<Pager
						width={width}
						index={
							weekPaging ? dayNumber(weekStart(selected)) / 7 : currentYear * 12 + currentMonth
						}
						keyFor={(offset) => {
							if (weekPaging) return `w${weekStart(addDays(selected, offset * 7))}`;
							const m = shiftMonth(currentYear, currentMonth, offset);
							return `m${m.year}-${m.month}`;
						}}
						renderPage={renderCalendarPage}
						onPage={onCalendarPage}
						race={calendarScroll}
						style={styles.body}
					/>
				</View>

				<Animated.View
					style={[styles.listArea, { height: Math.max(0, bodyPx - ROW_MONTH) }, listStyle]}
				>
					{/* Skeleton only until the shown month has data (cached or built) — not for neighbours */}
					{c.loading ? (
						<CalendarSkeleton />
					) : (
						// Vertical drag only (it scrolls the list / resizes the grid). Sideways drags
						// fail it and reach the bottom tab pager, so Calendar ↔ Search swiping works.
						<GestureDetector gesture={listScrollGesture}>
							<Animated.View style={[styles.body, daySwapStyle]}>{dayPage}</Animated.View>
						</GestureDetector>
					)}
				</Animated.View>
			</View>

			{/* Full view: tapping a day shows its cards in a popup */}
			<AnimatedModal visible={!!popupDate} onClose={closePopup} wide>
				{popupDate && (
					// Own gesture root: a Modal renders outside the app's. The rounded box is a plain View
					// inside it — on Android the root's native view ignores borderRadius / overflow, so
					// styling the root left square corners and unclipped pages
					<GestureHandlerRootView style={styles.popupRoot}>
						<View style={styles.dayPopup}>
							<Pager
								width={popupW}
								index={dayNumber(popupDate)}
								keyFor={(offset) => addDays(popupDate, offset)}
								renderPage={renderPopupPage}
								onPage={onPopupPage}
								// One height for every day (the most it may take): sizing to each day's
								// list made it jump between days, and an empty day shrank the swipe area
								style={{ height: popupMaxH }}
							/>
						</View>
					</GestureHandlerRootView>
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
					onLoadEpisodeDetails={loadEpisodeDetails}
					watchedKeys={NO_WATCHED}
					currentNextEpisode={null}
					onMarkWatched={noopAsync}
					onMarkWatchedThrough={noopAsync}
					onUnmarkWatched={noopAsync}
					onShowPress={() => {
						setInfoEp(null);
						closePopup();
						navigation.navigate(Route.SHOW_DETAIL, {
							tmdbId: infoEp.tmdbShowId,
							mediaType: MediaType.TV,
						});
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
								<Text
									style={[styles.yearItemText, item === currentYear && styles.yearItemTextActive]}
								>
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
