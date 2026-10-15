import { useCallback, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedModal, LoadingSpinner } from "../components";
import { LegendList } from "@legendapp/list/react-native";
import { Calendar, DateData } from "react-native-calendars";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, spacing, typography } from "../theme";
import { CalendarStackParamList, Route, MediaType } from "../types";
import { useCalendarScreen, YEARS, type CalendarEpisode } from "./useCalendarScreen";
import { Image } from "expo-image";
import { tmdbBackdropUri, tmdbLogoUri } from "../hooks/useTmdbImage";
import { BLUR_RADIUS } from "./ProfileScreen/styles";

const CARD_WIDTH = Dimensions.get("window").width - 32;
const pad2 = (n: number) => String(n).padStart(2, "0");
const CARD_MIN_HEIGHT = 120;
// Episode square spans the card's height minus its vertical padding
const EP_SQUARE = CARD_MIN_HEIGHT - spacing.md * 2;

type NavProp = NativeStackNavigationProp<CalendarStackParamList, Route.CALENDAR_MAIN>;

export default function CalendarScreen() {
	const { top } = useSafeAreaInsets();
	const navigation = useNavigation<NavProp>();
	const yearListRef = useRef<any>(null);
	const {
		loading: calendarLoading,
		selectedDate,
		currentYear,
		currentMonth,
		yearModalVisible,
		setYearModalVisible,
		resetToToday,
		markedDates,
		selectedEpisodes,
		handleDayPress: selectDay,
		handleMonthChange: changeMonth,
		selectYear,
		monthLabel,
	} = useCalendarScreen();

	// Reset to current month when tab is focused
	// Back to today only when the Calendar tab is entered — not when returning from a
	// show page pushed inside this tab (that's a focus of this screen, not of the tab)
	useEffect(() => navigation.getParent()?.addListener("focus", resetToToday), [navigation, resetToToday]);

	const handleDayPress = useCallback((day: DateData) => selectDay(day.dateString), [selectDay]);
	const handleMonthChange = useCallback(
		(month: DateData) => changeMonth(month.year, month.month),
		[changeMonth],
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
	}, [currentYear, setYearModalVisible]);

	const renderEpisode = useCallback(
		({ item }: { item: CalendarEpisode }) => {
			const isMovie = item.mediaType === MediaType.MOVIE;
			return (
				<TouchableOpacity
					style={styles.episodeCard}
					activeOpacity={0.85}
					onPress={() =>
						navigation.navigate(Route.SHOW_DETAIL, {
							tmdbId: item.tmdbShowId,
							mediaType: isMovie ? MediaType.MOVIE : MediaType.TV,
						})
					}
				>
					{/* Same backdrop treatment as the Watch History cards */}
					{item.backdropPath && (
						<Image
							source={{ uri: tmdbBackdropUri(item.backdropPath, CARD_WIDTH) }}
							style={StyleSheet.absoluteFill}
							contentFit="cover"
							// Wide, short card: show the top of the backdrop (faces / titles sit there)
							contentPosition="top"
							blurRadius={BLUR_RADIUS}
						/>
					)}
					<View style={[StyleSheet.absoluteFill, styles.cardOverlay]} />
					<View style={styles.epInfo}>
						{/* Title logo when TMDB has one, else the name */}
						{item.logoPath ? (
							<Image
								source={{ uri: tmdbLogoUri(item.logoPath, CARD_WIDTH * 0.6) }}
								style={styles.logo}
								contentFit="contain"
								contentPosition="left center"
								accessibilityLabel={item.showTitle}
							/>
						) : (
							<Text style={styles.showTitle} numberOfLines={1}>
								{item.showTitle}
							</Text>
						)}
						{isMovie ? (
							<View style={styles.movieBadge}>
								<Text style={styles.movieBadgeText}>MOVIE</Text>
							</View>
						) : (
							<Text style={styles.epTitle} numberOfLines={2}>
								{item.episodeTitle}
							</Text>
						)}
					</View>
					{/* Right square: SEASON xx over a big Exx; movies get their release year */}
					<View style={styles.epSquare}>
						<Text style={styles.epSquareTitle}>{isMovie ? "YEAR" : `SEASON ${pad2(item.season)}`}</Text>
						<View style={styles.epSquareRule} />
						<Text style={[styles.epSquareValue, isMovie && styles.epSquareYear]}>
							{isMovie ? item.airDate.slice(0, 4) : `E${pad2(item.episode)}`}
						</Text>
					</View>
				</TouchableOpacity>
			);
		},
		[navigation],
	);

	return (
		<View style={[styles.container, { paddingTop: top }]}>
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
	episodeCard: {
		minHeight: CARD_MIN_HEIGHT,
		flexDirection: "row",
		alignItems: "center",
		marginHorizontal: spacing.lg,
		marginBottom: spacing.md,
		padding: spacing.md,
		borderRadius: 16,
		overflow: "hidden",
		backgroundColor: colors.surface,
	},
	cardOverlay: { backgroundColor: "rgba(0, 0, 0, 0.55)" },
	epInfo: { flex: 1 },
	logo: { height: 36, width: "60%", marginBottom: spacing.sm },
	showTitle: {
		...typography.subtitle,
		fontSize: 14,
	},
	// SEASON xx title, rule, big Exx (movies: release year); fills the card's inner height
	epSquare: {
		width: EP_SQUARE,
		height: EP_SQUARE,
		marginLeft: spacing.md,
		backgroundColor: colors.badgeOverlay,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.sm,
	},
	epSquareTitle: {
		fontSize: 11,
		fontWeight: "500",
		letterSpacing: 1,
		color: colors.text,
	},
	epSquareRule: {
		alignSelf: "stretch",
		height: 1,
		backgroundColor: colors.text,
		marginVertical: 6,
	},
	epSquareValue: { fontSize: 40, fontWeight: "300", color: colors.text, lineHeight: 44 },
	epSquareYear: { fontSize: 28, lineHeight: 36 },
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
		color: colors.text,
		marginTop: spacing.xs,
		fontSize: 15,
		fontWeight: "500",
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
