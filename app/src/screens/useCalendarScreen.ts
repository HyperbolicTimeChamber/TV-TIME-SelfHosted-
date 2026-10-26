import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useAuthStore } from "../stores";
import { useCalendarEpisodes, getCachedCatalogShow } from "../hooks";
import { ensureFreshCatalogs } from "../hooks/catalogRefresh";
import { MediaType } from "../enums";
import type { UpcomingEpisode } from "../types";

/** Where the calendar is — restorable (web: returning via Back keeps the date) */
export interface CalendarPosition {
	selectedDate: string | null;
	year: number;
	month: number;
}

/** A day's episode / movie, with its backdrop for the list card */
export type CalendarEpisode = UpcomingEpisode & {
	backdropPath: string | null;
	logoPath: string | null;
};
import { colors } from "../theme";
import { todayStr, inMonth, shiftMonth, sameDayIn, parseDay } from "../utils";
import { buildDayMarks } from "../utils/calendarGroups";

/** A month stays on screen this long before its episodes are built (flicked-past months
 *  are never built) */
const MONTH_SETTLE_MS = 300;

const YEAR_RANGE_START = 1950;
const YEAR_RANGE_END = 2035;
export const YEARS = Array.from(
	{ length: YEAR_RANGE_END - YEAR_RANGE_START + 1 },
	(_, i) => YEAR_RANGE_START + i,
);

export interface DayMark {
	marked: boolean;
	dotColor: string;
	selected?: boolean;
	selectedColor?: string;
}

/**
 * Calendar state: month/year navigation, selected day, airing dots and the
 * day's episodes. Shared by the mobile CalendarScreen and the web calendar.
 */
export function useCalendarScreen(initial?: CalendarPosition | null) {
	const user = useAuthStore((s) => s.user);
	const [selectedDate, setSelectedDate] = useState<string | null>(
		initial?.selectedDate ?? todayStr(),
	);
	const [yearModalVisible, setYearModalVisible] = useState(false);
	const now = new Date();
	const [currentYear, setCurrentYear] = useState(initial?.year ?? now.getFullYear());
	const [currentMonth, setCurrentMonth] = useState(initial?.month ?? now.getMonth() + 1);

	const { episodes, isMonthLoading, loadMonthEpisodes } = useCalendarEpisodes(user?.uid);
	// Skeleton only while the shown month has nothing to render — cached months show at once
	const loading = isMonthLoading(currentYear, currentMonth);

	// Shown month + its neighbours (swiping peeks at them; list paging crosses into them)
	const loadAroundNow = useCallback(
		(year: number, month: number) => {
			loadMonthEpisodes(year, month);
			for (const n of [-1, 1]) {
				const m = shiftMonth(year, month, n);
				loadMonthEpisodes(m.year, m.month);
			}
		},
		[loadMonthEpisodes],
	);

	// Building a month walks every tracked show's catalog and hits TMDB discover. Flicking
	// through a year of months fired ~3 of those per turn and locked up the JS thread, so a
	// turn only schedules the build — the months flicked past are never built at all.
	const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const loadAround = useCallback(
		(year: number, month: number) => {
			if (loadTimer.current) clearTimeout(loadTimer.current);
			loadTimer.current = setTimeout(() => loadAroundNow(year, month), MONTH_SETTLE_MS);
		},
		[loadAroundNow],
	);
	useEffect(() => () => void (loadTimer.current && clearTimeout(loadTimer.current)), []);

	// Load current month's episodes on mount
	useEffect(() => {
		loadAroundNow(currentYear, currentMonth);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [user?.uid]);

	/** Back to today (app: on tab focus) */
	const resetToToday = useCallback(() => {
		const today = new Date();
		setCurrentYear(today.getFullYear());
		setCurrentMonth(today.getMonth() + 1);
		setSelectedDate(todayStr());
		loadAroundNow(today.getFullYear(), today.getMonth() + 1);
	}, [loadAroundNow]);

	const markedDates = useMemo(() => {
		const marks: Record<string, DayMark> = {};
		if (!episodes) return marks;
		for (const ep of episodes) {
			marks[ep.airDate] = { marked: true, dotColor: colors.primary };
		}
		if (selectedDate && marks[selectedDate]) {
			marks[selectedDate] = {
				...marks[selectedDate],
				dotColor: colors.background,
				selected: true,
				selectedColor: colors.primary,
			};
		} else if (selectedDate) {
			marks[selectedDate] = {
				marked: false,
				dotColor: colors.primary,
				selected: true,
				selectedColor: colors.surfaceLight,
			};
		}
		return marks;
	}, [episodes, selectedDate]);

	// Catalog cache isn't reactive — bump after refreshing stale entries (missing logos)
	const [catalogVersion, setCatalogVersion] = useState(0);
	useEffect(() => {
		if (!selectedDate || !episodes) return;
		const day = episodes
			.filter((ep) => ep.airDate === selectedDate)
			.map((ep) => ({
				tmdbId: ep.tmdbShowId,
				mediaType: ep.mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV,
			}));
		ensureFreshCatalogs(day)
			.then((fetched) => fetched && setCatalogVersion((v) => v + 1))
			.catch(() => {});
	}, [episodes, selectedDate]);

	// Indexed once per change instead of scanning every loaded month on each call — the screen
	// asks for several days per render, and `episodes` holds every month visited this session
	const byDate = useMemo(() => {
		const map = new Map<string, UpcomingEpisode[]>();
		for (const ep of episodes ?? []) {
			const day = map.get(ep.airDate);
			if (day) day.push(ep);
			else map.set(ep.airDate, [ep]);
		}
		return map;
	}, [episodes]);

	// + backdrop and logo from the shared catalog cache (no reads) for the cards
	const episodesForDate = useCallback(
		(date: string | null): CalendarEpisode[] => {
			if (!date) return [];
			return (byDate.get(date) ?? []).map((ep) => {
				const catalog = getCachedCatalogShow(
					ep.tmdbShowId,
					ep.mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV,
				);
				return {
					...ep,
					backdropPath: catalog?.backdropPath ?? null,
					logoPath: catalog?.logoPath ?? null,
				};
			});
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[byDate, catalogVersion],
	);
	const selectedEpisodes = useMemo(
		() => episodesForDate(selectedDate),
		[episodesForDate, selectedDate],
	);

	/** date → markers for the calendar cells (one per show/movie) */
	const dayMarks = useMemo(() => buildDayMarks(episodes ?? []), [episodes]);

	const handleDayPress = useCallback((dateString: string) => {
		setSelectedDate(dateString);
	}, []);

	/** Select any day; the shown month follows when it's in another month (week / list paging) */
	const selectDate = useCallback(
		(date: string) => {
			setSelectedDate(date);
			const d = parseDay(date);
			const year = d.getFullYear();
			const month = d.getMonth() + 1;
			if (!inMonth(date, currentYear, currentMonth)) {
				setCurrentYear(year);
				setCurrentMonth(month);
				loadAround(year, month);
			}
		},
		[currentYear, currentMonth, loadAround],
	);

	const handleMonthChange = useCallback(
		(year: number, month: number) => {
			setCurrentYear(year);
			setCurrentMonth(month);
			loadAround(year, month);

			// Auto-select same day in new month, clamped to last day
			if (selectedDate) setSelectedDate(sameDayIn(selectedDate, year, month));
		},
		[loadAround, selectedDate],
	);

	const selectYear = useCallback(
		(year: number) => {
			setCurrentYear(year);
			setYearModalVisible(false);
			loadAround(year, currentMonth);
			if (selectedDate) setSelectedDate(sameDayIn(selectedDate, year, currentMonth));
		},
		[loadAround, currentMonth, selectedDate],
	);

	const monthLabel = new Date(currentYear, currentMonth - 1).toLocaleDateString("en-US", {
		month: "long",
		year: "numeric",
	});

	return {
		episodes,
		loading,
		selectedDate,
		currentYear,
		currentMonth,
		yearModalVisible,
		setYearModalVisible,
		resetToToday,
		markedDates,
		selectedEpisodes,
		episodesForDate,
		dayMarks,
		selectDate,
		handleDayPress,
		handleMonthChange,
		selectYear,
		monthLabel,
	};
}
