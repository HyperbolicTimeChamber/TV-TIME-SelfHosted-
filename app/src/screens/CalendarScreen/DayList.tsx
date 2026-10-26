import { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import Reanimated from "react-native-reanimated";
import { ScrollView } from "react-native-gesture-handler";
import AccordionArrow, {
	accordionLayout,
	stripEntering,
	stripExiting,
} from "../../components/AccordionArrow";
import { tmdbBlurredBackdropUri, tmdbLogoUri } from "../../hooks/useTmdbImage";
import { MediaType } from "../../types";
import { BLUR_RADIUS } from "../ProfileScreen/styles";
import type { CalendarEpisode } from "../useCalendarScreen";
import {
	groupCalendarDay,
	episodeCountLabel,
	seasonRangeLabel,
	CalendarRowKind,
	type CalendarGroup,
} from "../../utils/calendarGroups";
import { formatAirTime } from "../../utils/airTime";
import { CARD_WIDTH, listStyles as styles } from "./listStyles";
import EmptyDay from "./EmptyDay";

const pad2 = (n: number) => String(n).padStart(2, "0");

// Flat day list: show cards, plus the episode strips of opened groups
type CalendarRow =
	| {
			kind: CalendarRowKind.CARD;
			key: string;
			group: CalendarGroup<CalendarEpisode>;
			expanded: boolean;
	  }
	| {
			kind: CalendarRowKind.CHILD;
			key: string;
			ep: CalendarEpisode;
			/** Position in its group */ nth: number;
	  };

interface Props {
	episodes: CalendarEpisode[];
	/** Episode tapped → its info card */
	onOpenEpisode: (ep: CalendarEpisode) => void;
	/** Movie tapped → its page */
	onOpenMovie: (ep: CalendarEpisode) => void;
	/** Bump to close every open group (e.g. leaving the screen) */
	collapseSignal?: number;
	/** Parent scrolls it (Calendar's combined calendar + list scroll): plain column, no ScrollView */
	externalScroll?: boolean;
	/** Off-screen neighbour day: skip the backdrop blur (the costly part) */
	lite?: boolean;
}

/** One day's cards: show/movie cards, several episodes of a show collapse into one */
export default function DayList({
	episodes,
	onOpenEpisode,
	onOpenMovie,
	collapseSignal,
	externalScroll,
	lite,
}: Props) {
	// Shows with several episodes that day collapse into one card; tap to open
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	useEffect(() => setExpanded(new Set()), [collapseSignal]);
	const toggleGroup = (key: string) =>
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});

	const rows = useMemo(() => {
		const out: CalendarRow[] = [];
		for (const group of groupCalendarDay(episodes)) {
			const open = expanded.has(group.key);
			out.push({ kind: CalendarRowKind.CARD, key: group.key, group, expanded: open });
			if (open && group.episodes.length > 1) {
				group.episodes.forEach((ep, nth) => {
					out.push({
						kind: CalendarRowKind.CHILD,
						key: `${group.key}_${ep.season}_${ep.episode}`,
						ep,
						nth,
					});
				});
			}
		}
		return out;
	}, [episodes, expanded]);

	if (episodes.length === 0) return <EmptyDay />;

	const renderRow = (row: CalendarRow) => {
		const isChild = row.kind === CalendarRowKind.CHILD;
		const item = isChild ? row.ep : row.group.first;
		const isMovie = item.mediaType === MediaType.MOVIE;
		// Episodes → info card; movies → their page
		const openShow = () => (isMovie ? onOpenMovie(item) : onOpenEpisode(item));

		// Episode under an opened show card: one line, Exx then its name
		if (isChild) {
			return (
				<TouchableOpacity style={styles.childCard} activeOpacity={0.85} onPress={openShow}>
					<View style={styles.childEpBox}>
						<Text style={styles.childEp}>E{pad2(item.episode)}</Text>
					</View>
					<Text style={styles.childTitle} numberOfLines={1}>
						{item.episodeTitle}
					</Text>
				</TouchableOpacity>
			);
		}

		const groupEps = row.group.episodes;
		const isGroup = groupEps.length > 1;
		// Local air time under Exx / above the arrow (a group: its first episode's)
		const airTime = isMovie ? null : formatAirTime(item.airStamp);
		return (
			<TouchableOpacity
				style={styles.episodeCard}
				activeOpacity={0.85}
				onPress={isGroup ? () => toggleGroup(row.key) : openShow}
			>
				{/* Same backdrop treatment as the Watch History cards */}
				{item.backdropPath && (
					<Image
						source={{ uri: tmdbBlurredBackdropUri(item.backdropPath) }}
						style={StyleSheet.absoluteFill}
						contentFit="cover"
						// Wide, short card: show the top of the backdrop (faces / titles sit there)
						contentPosition="top"
						blurRadius={lite ? undefined : BLUR_RADIUS}
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
						// Collapsed show: its season(s) where an episode name would be; count is in the square
						<Text style={styles.epTitle} numberOfLines={2}>
							{isGroup ? seasonRangeLabel(groupEps) : item.episodeTitle}
						</Text>
					)}
				</View>
				{isGroup ? (
					// Collapsed show: same square, a dropdown arrow (flips when open) in place of Exx
					<View style={styles.epSquare}>
						<Text style={styles.epSquareTitle}>{episodeCountLabel(groupEps).toUpperCase()}</Text>
						<View style={styles.epSquareRule} />
						<View style={styles.epSquareArrow}>
							{airTime && <Text style={styles.epSquareTime}>{airTime}</Text>}
							<AccordionArrow open={row.expanded} size={40} />
						</View>
					</View>
				) : (
					// Right square: SEASON xx over a big Exx; movies their release year
					<View style={[styles.epSquare, airTime && styles.epSquareTimed]}>
						<Text style={styles.epSquareTitle}>
							{isMovie ? "YEAR" : `SEASON ${pad2(item.season)}`}
						</Text>
						<View style={[styles.epSquareRule, airTime && styles.epSquareRuleTimed]} />
						<Text
							style={[
								styles.epSquareValue,
								isMovie && styles.epSquareYear,
								airTime && styles.epSquareValueTimed,
							]}
						>
							{isMovie ? item.airDate.slice(0, 4) : `E${pad2(item.episode)}`}
						</Text>
						{airTime && <Text style={styles.epSquareTime}>{airTime}</Text>}
					</View>
				)}
			</TouchableOpacity>
		);
	};

	const content = rows.map((row) => {
		const isChild = row.kind === CalendarRowKind.CHILD;
		return (
			<Reanimated.View
				key={row.key}
				layout={accordionLayout}
				entering={isChild ? stripEntering(row.nth) : undefined}
				exiting={isChild ? stripExiting : undefined}
			>
				{renderRow(row)}
			</Reanimated.View>
		);
	});

	if (externalScroll) return <View style={styles.listContent}>{content}</View>;
	// Short list (one day) → plain scroll view, so rows can animate in/out and reflow.
	// Gesture-handler ScrollView: vertical scroll here, horizontal swipes go to the day pager.
	return <ScrollView contentContainerStyle={styles.listContent}>{content}</ScrollView>;
}
