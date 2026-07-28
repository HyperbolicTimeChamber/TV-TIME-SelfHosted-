import React, { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { AnimatedModal, LoadingSpinner } from "../components";
import { LegendList } from "@legendapp/list/react-native";
import { Calendar, DateData } from "react-native-calendars";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuthStore } from "../stores";
import { useCalendarEpisodes } from "../hooks";
import PosterImage from "../components/PosterImage";
import { colors, spacing, typography } from "../theme";
import { UpcomingEpisode, CalendarStackParamList, Route, MediaType } from "../types";

type NavProp = NativeStackNavigationProp<CalendarStackParamList, Route.CALENDAR_MAIN>;

const YEAR_RANGE_START = 1950;
const YEAR_RANGE_END = 2035;
const YEARS = Array.from(
	{ length: YEAR_RANGE_END - YEAR_RANGE_START + 1 },
	(_, i) => YEAR_RANGE_START + i,
);

export default function CalendarScreen() {
	const user = useAuthStore((s) => s.user);
	const navigation = useNavigation<NavProp>();
	const [selectedDate, setSelectedDate] = useState<string | null>(
		new Date().toISOString().slice(0, 10),
	);
	const [yearModalVisible, setYearModalVisible] = useState(false);

	const now = new Date();
	const [currentYear, setCurrentYear] = useState(now.getFullYear());
	const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1);
	const yearListRef = useRef<any>(null);

	const { episodes, loading: calendarLoading, loadMonthEpisodes } = useCalendarEpisodes(user?.uid);

	// Load current month's episodes on mount
	useEffect(() => {
		loadMonthEpisodes(currentYear, currentMonth);
	}, [user?.uid]);

	// Reset to current month when tab is focused
	useFocusEffect(
		useCallback(() => {
			const today = new Date();
			setCurrentYear(today.getFullYear());
			setCurrentMonth(today.getMonth() + 1);
			setSelectedDate(today.toISOString().slice(0, 10));
		}, []),
	);

	const markedDates = useMemo(() => {
		const marks: Record<
			string,
			{
				marked: boolean;
				dotColor: string;
				selected?: boolean;
				selectedColor?: string;
			}
		> = {};
		if (!episodes) return marks;

		for (const ep of episodes) {
			marks[ep.airDate] = {
				marked: true,
				dotColor: colors.primary,
			};
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

	const selectedEpisodes = useMemo(() => {
		if (!selectedDate || !episodes) return [];
		return episodes.filter((ep) => ep.airDate === selectedDate);
	}, [episodes, selectedDate]);

	const handleDayPress = useCallback((day: DateData) => {
		setSelectedDate(day.dateString);
	}, []);

	const handleMonthChange = useCallback(
		(month: DateData) => {
			setCurrentYear(month.year);
			setCurrentMonth(month.month);
			loadMonthEpisodes(month.year, month.month);

			// Auto-select same day in new month, clamped to last day
			if (selectedDate) {
				const prevDay = parseInt(selectedDate.split("-")[2], 10);
				const lastDay = new Date(month.year, month.month, 0).getDate();
				const day = Math.min(prevDay, lastDay);
				setSelectedDate(
					`${month.year}-${String(month.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
				);
			}
		},
		[loadMonthEpisodes, selectedDate],
	);

	const calendarKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
	const initialDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;

	const openYearModal = useCallback(() => {
		setYearModalVisible(true);
		setTimeout(() => {
			const idx = YEARS.indexOf(currentYear);
			if (idx >= 0) {
				yearListRef.current?.scrollToIndex({
					index: idx,
					animated: false,
					viewPosition: 0.4,
				});
			}
		}, 100);
	}, [currentYear]);

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

	const renderEpisode = useCallback(
		({ item }: { item: UpcomingEpisode }) => {
			const isMovie = item.mediaType === MediaType.MOVIE;
			return (
				<TouchableOpacity
					style={styles.episodeRow}
					onPress={() =>
						navigation.navigate(Route.SHOW_DETAIL, {
							tmdbId: item.tmdbShowId,
							mediaType: isMovie ? MediaType.MOVIE : MediaType.TV,
						})
					}
				>
					<PosterImage
						posterPath={item.posterPath}
						mediaType={item.mediaType}
						style={styles.poster}
					/>
					<View style={styles.epInfo}>
						<Text style={styles.showTitle} numberOfLines={1}>
							{item.showTitle}
						</Text>
						{isMovie ? (
							<View style={styles.movieBadge}>
								<Text style={styles.movieBadgeText}>MOVIE</Text>
							</View>
						) : (
							<Text style={styles.epLabel}>
								S{String(item.season).padStart(2, "0")}E{String(item.episode).padStart(2, "0")}
							</Text>
						)}
						{!isMovie && (
							<Text style={styles.epTitle} numberOfLines={1}>
								{item.episodeTitle}
							</Text>
						)}
					</View>
				</TouchableOpacity>
			);
		},
		[navigation],
	);

	return (
		<View style={styles.container}>
			<Calendar
				key={calendarKey}
				current={initialDate}
				onDayPress={handleDayPress}
				onMonthChange={handleMonthChange}
				markedDates={markedDates}
				renderHeader={() => (
					<TouchableOpacity onPress={openYearModal}>
						<Text style={styles.headerTitle}>{monthLabel}</Text>
					</TouchableOpacity>
				)}
				theme={{
					backgroundColor: colors.background,
					calendarBackground: colors.background,
					textSectionTitleColor: colors.textSecondary,
					selectedDayBackgroundColor: colors.primary,
					selectedDayTextColor: colors.text,
					todayTextColor: colors.primary,
					dayTextColor: colors.text,
					textDisabledColor: colors.textMuted,
					monthTextColor: colors.text,
					arrowColor: colors.primary,
				}}
			/>

			{calendarLoading ? (
				<View style={styles.loaderCenter}>
					<LoadingSpinner />
					<Text style={styles.loaderText}>Checking your calendar...</Text>
				</View>
			) : (
				selectedDate && (
					<View style={styles.episodeList}>
						<Text style={styles.dateHeader}>
							{new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
								weekday: "long",
								month: "long",
								day: "numeric",
							})}
						</Text>
						{selectedEpisodes.length === 0 ? (
							<Text style={styles.noEps}>No episodes on this day</Text>
						) : (
							<LegendList
								data={selectedEpisodes}
								keyExtractor={(item) => `${item.tmdbShowId}_${item.season}_${item.episode}`}
								renderItem={renderEpisode}
							/>
						)}
					</View>
				)
			)}

			{/* Year picker modal */}
			<AnimatedModal visible={yearModalVisible} onClose={() => setYearModalVisible(false)}>
				<View style={styles.modalContent}>
					<Text style={styles.modalTitle}>Select Year</Text>
					<LegendList
						ref={yearListRef}
						data={YEARS}
						keyExtractor={(item) => String(item)}
						renderItem={({ item }) => (
							<TouchableOpacity
								style={[styles.yearItem, item === currentYear && styles.yearItemActive]}
								onPress={() => selectYear(item)}
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

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	headerTitle: {
		...typography.title,
		fontSize: 18,
		textAlign: "center",
		paddingVertical: spacing.sm,
	},
	episodeList: {
		flex: 1,
		paddingTop: spacing.md,
	},
	dateHeader: {
		...typography.subtitle,
		paddingHorizontal: spacing.lg,
		paddingBottom: spacing.sm,
	},
	noEps: {
		...typography.caption,
		paddingHorizontal: spacing.lg,
	},
	loaderCenter: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: spacing.xl,
	},
	loaderText: {
		...typography.caption,
		color: colors.textMuted,
		marginTop: spacing.md,
	},
	episodeRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.sm,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
	},
	poster: {
		width: 45,
		height: 67,
		borderRadius: 4,
	},
	epInfo: {
		flex: 1,
		marginLeft: spacing.md,
	},
	showTitle: {
		...typography.subtitle,
		fontSize: 14,
	},
	epLabel: {
		...typography.caption,
		marginTop: spacing.xs,
	},
	movieBadge: {
		alignSelf: "flex-start",
		backgroundColor: colors.moviePurple,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		borderRadius: 4,
		marginTop: spacing.xs,
	},
	movieBadgeText: {
		fontSize: 10,
		fontWeight: "700",
		color: colors.text,
		letterSpacing: 0.5,
	},
	epTitle: {
		...typography.body,
		color: colors.textSecondary,
		marginTop: spacing.xs,
		fontSize: 13,
	},
	modalContent: {
		backgroundColor: colors.surface,
		borderRadius: 16,
		width: 200,
		height: 350,
		paddingVertical: spacing.lg,
		alignItems: "center",
	},
	modalTitle: {
		...typography.subtitle,
		marginBottom: spacing.md,
	},
	yearList: {
		flex: 1,
		width: "100%",
	},
	yearItem: {
		height: 52,
		justifyContent: "center",
		alignItems: "center",
	},
	yearItemActive: {
		backgroundColor: colors.primary,
		marginHorizontal: spacing.lg,
		borderRadius: 8,
	},
	yearItemText: {
		...typography.body,
		fontSize: 18,
		color: colors.textSecondary,
	},
	yearItemTextActive: {
		color: colors.text,
		fontWeight: "700",
	},
});
