import { useMemo, useState, useCallback, useEffect } from "react";
import { useAuthStore } from "../stores";
import { useCalendarEpisodes, getCachedCatalogShow } from "../hooks";
import { ensureFreshCatalogs } from "../hooks/catalogRefresh";
import { MediaType } from "../enums";
import type { UpcomingEpisode } from "../types";

/** A day's episode / movie, with its backdrop for the list card */
export type CalendarEpisode = UpcomingEpisode & { backdropPath: string | null; logoPath: string | null };
import { colors } from "../theme";
import { todayStr } from "../utils";

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
export function useCalendarScreen() {
	const user = useAuthStore((s) => s.user);
	const [selectedDate, setSelectedDate] = useState<string | null>(todayStr());
	const [yearModalVisible, setYearModalVisible] = useState(false);
	const now = new Date();
	const [currentYear, setCurrentYear] = useState(now.getFullYear());
	const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1);

	const { episodes, loading, loadMonthEpisodes } = useCalendarEpisodes(user?.uid);

	// Load current month's episodes on mount
	useEffect(() => {
		loadMonthEpisodes(currentYear, currentMonth);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [user?.uid]);

	/** Back to today (app: on tab focus) */
	const resetToToday = useCallback(() => {
		const today = new Date();
		setCurrentYear(today.getFullYear());
		setCurrentMonth(today.getMonth() + 1);
		setSelectedDate(todayStr());
	}, []);

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

	// + backdrop and logo from the shared catalog cache (no reads) for the cards
	const selectedEpisodes = useMemo((): CalendarEpisode[] => {
		if (!selectedDate || !episodes) return [];
		return episodes
			.filter((ep) => ep.airDate === selectedDate)
			.map((ep) => {
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
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [episodes, selectedDate, catalogVersion]);

	const handleDayPress = useCallback((dateString: string) => {
		setSelectedDate(dateString);
	}, []);

	const handleMonthChange = useCallback(
		(year: number, month: number) => {
			setCurrentYear(year);
			setCurrentMonth(month);
			loadMonthEpisodes(year, month);

			// Auto-select same day in new month, clamped to last day
			if (selectedDate) {
				const prevDay = parseInt(selectedDate.split("-")[2], 10);
				const lastDay = new Date(year, month, 0).getDate();
				const day = Math.min(prevDay, lastDay);
				setSelectedDate(
					`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
				);
			}
		},
		[loadMonthEpisodes, selectedDate],
	);

	const selectYear = useCallback(
		(year: number) => {
			setCurrentYear(year);
			setYearModalVisible(false);
			loadMonthEpisodes(year, currentMonth);
		},
		[loadMonthEpisodes, currentMonth],
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
		handleDayPress,
		handleMonthChange,
		selectYear,
		monthLabel,
	};
}
