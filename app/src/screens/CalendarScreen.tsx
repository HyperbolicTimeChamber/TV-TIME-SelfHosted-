import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnimatedModal } from "../components";
import { useSharedShimmer } from "../components/SkeletonLine";
import ArrowDropdownCircle from "../components/ArrowDropdownCircle";
import { LegendList } from "@legendapp/list/react-native";
import { Calendar, DateData } from "react-native-calendars";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { colors, fonts, spacing, typography } from "../theme";
import { CalendarStackParamList, Route, MediaType } from "../types";
import { useCalendarScreen, YEARS, type CalendarEpisode } from "./useCalendarScreen";
import { Image } from "expo-image";
import { tmdbBackdropUri, tmdbLogoUri } from "../hooks/useTmdbImage";
import { BLUR_RADIUS } from "./ProfileScreen/styles";
import {
	groupCalendarDay,
	episodeCountLabel,
	seasonRangeLabel,
	CalendarRowKind,
	type CalendarGroup,
} from "../utils/calendarGroups";

const CARD_WIDTH = Dimensions.get("window").width - 32;
const pad2 = (n: number) => String(n).padStart(2, "0");
const CARD_MIN_HEIGHT = 120;
// Episode square spans the card's height minus its vertical padding
const EP_SQUARE = CARD_MIN_HEIGHT - spacing.md * 2;

type NavProp = NativeStackNavigationProp<CalendarStackParamList, Route.CALENDAR_MAIN>;

// LegendList ignores extraData — open/closed state rides in the row itself
type CalendarRow =
	| { kind: CalendarRowKind.CARD; key: string; group: CalendarGroup<CalendarEpisode>; expanded: boolean }
	| { kind: CalendarRowKind.CHILD; key: string; ep: CalendarEpisode };

const SKELETON_CARDS = 3;

/** Day list placeholder: date line + cards, pulsing on the shared shimmer */
function CalendarSkeleton() {
	const shimmer = useSharedShimmer();
	return (
		<View style={styles.episodeList}>
			<Animated.View style={[styles.skeletonHeader, { opacity: shimmer }]} />
			{Array.from({ length: SKELETON_CARDS }, (_, i) => (
				<Animated.View key={i} style={[styles.skeletonCard, { opacity: shimmer }]} />
			))}
		</View>
	);
}

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

	// Shows with several episodes that day collapse into one card; tap to open
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	useEffect(() => setExpanded(new Set()), [selectedDate]);
	const toggleGroup = useCallback((key: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	const rows = useMemo(() => {
		const out: CalendarRow[] = [];
		for (const group of groupCalendarDay(selectedEpisodes)) {
			const open = expanded.has(group.key);
			out.push({ kind: CalendarRowKind.CARD, key: group.key, group, expanded: open });
			if (open && group.episodes.length > 1) {
				for (const ep of group.episodes) {
					out.push({ kind: CalendarRowKind.CHILD, key: `${group.key}_${ep.season}_${ep.episode}`, ep });
				}
			}
		}
		return out;
	}, [selectedEpisodes, expanded]);

	const renderRow = useCallback(
		({ item: row }: { item: CalendarRow }) => {
			const isChild = row.kind === CalendarRowKind.CHILD;
			const item = isChild ? row.ep : row.group.first;
			const isMovie = item.mediaType === MediaType.MOVIE;
			const openShow = () =>
				navigation.navigate(Route.SHOW_DETAIL, {
					tmdbId: item.tmdbShowId,
					mediaType: isMovie ? MediaType.MOVIE : MediaType.TV,
				});
			const backdrop = (
				<>
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
				</>
			);

			// Episode under an opened show card: one line, Exx then its name
			if (isChild) {
				return (
					<TouchableOpacity style={styles.childCard} activeOpacity={0.85} onPress={openShow}>
						{backdrop}
						<Text style={styles.childEp}>E{pad2(item.episode)}</Text>
						<Text style={styles.childTitle} numberOfLines={1}>
							{item.episodeTitle}
						</Text>
					</TouchableOpacity>
				);
			}

			const groupEps = row.group.episodes;
			const isGroup = groupEps.length > 1;
			return (
				<TouchableOpacity
					style={styles.episodeCard}
					activeOpacity={0.85}
					onPress={isGroup ? () => toggleGroup(row.key) : openShow}
				>
					{backdrop}
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
								{isGroup ? episodeCountLabel(groupEps) : item.episodeTitle}
							</Text>
						)}
					</View>
					{isGroup ? (
						// Collapsed show: SEASON pill over a dropdown arrow that flips when open
						<View style={styles.groupSide}>
							<View style={styles.seasonPill}>
								<Text style={styles.seasonPillText}>{seasonRangeLabel(groupEps)}</Text>
							</View>
							<ArrowDropdownCircle size={30} flipped={row.expanded} />
						</View>
					) : (
						// Right square: SEASON xx over a big Exx; movies their release year
						<View style={styles.epSquare}>
							<Text style={styles.epSquareTitle}>{isMovie ? "YEAR" : `SEASON ${pad2(item.season)}`}</Text>
							<View style={styles.epSquareRule} />
							<Text style={[styles.epSquareValue, isMovie && styles.epSquareYear]}>
								{isMovie ? item.airDate.slice(0, 4) : `E${pad2(item.episode)}`}
							</Text>
						</View>
					)}
				</TouchableOpacity>
			);
		},
		[navigation, toggleGroup],
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
				<CalendarSkeleton />
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
								data={rows}
								keyExtractor={(row) => row.key}
								renderItem={renderRow}
								getItemType={(row) => row.kind}
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
	skeletonHeader: {
		width: 160,
		height: 18,
		borderRadius: 6,
		marginHorizontal: spacing.lg,
		marginBottom: spacing.md,
		backgroundColor: colors.surfaceLight,
	},
	skeletonCard: {
		height: CARD_MIN_HEIGHT,
		marginHorizontal: spacing.lg,
		marginBottom: spacing.md,
		borderRadius: 16,
		backgroundColor: colors.surfaceLight,
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
	// Episode under an opened show card: one-line strip, same backdrop cropped to fit
	childCard: {
		height: 52,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		marginHorizontal: spacing.lg,
		marginBottom: spacing.sm,
		paddingHorizontal: spacing.md,
		borderRadius: 12,
		overflow: "hidden",
		backgroundColor: colors.surface,
	},
	childEp: { fontFamily: fonts.smoochMedium, fontSize: 24, color: colors.text, letterSpacing: 1 },
	childTitle: { ...typography.body, flex: 1, fontSize: 15, fontWeight: "500", color: colors.text },
	// Collapsed show's right side: SEASON pill above the dropdown arrow
	groupSide: { alignItems: "center", gap: spacing.sm, marginLeft: spacing.md },
	seasonPill: {
		backgroundColor: colors.badgeOverlay,
		borderRadius: 999,
		paddingHorizontal: 12,
		paddingVertical: 4,
	},
	seasonPillText: { ...typography.caption, fontSize: 14, color: colors.text, fontWeight: "600" },
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
		// Smooch Sans digits leave extra room under them — nudge the stack down
		paddingTop: 6,
	},
	epSquareTitle: {
		fontFamily: fonts.smoochMedium,
		fontSize: 16,
		letterSpacing: 1.5,
		color: colors.text,
	},
	epSquareRule: {
		alignSelf: "stretch",
		height: 1,
		backgroundColor: colors.text,
		marginVertical: 6,
	},
	epSquareValue: { fontFamily: fonts.smoochRegular, fontSize: 56, color: colors.text, lineHeight: 58 },
	epSquareYear: { fontSize: 40, lineHeight: 44 },
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
