import { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, fonts, spacing, themedStyles } from "../../../theme";
import CardInfo, { cardStyles } from "../../../components/CardInfo";
import { upcomingDirector, upcomingRuntime } from "../../../hooks/useUpcomingEpisodes";
import { formatRuntime } from "../../../utils/customLists";
import { formatAirTime } from "../../../utils/airTime";
import PosterImage from "../../../components/PosterImage";
import { UpcomingEpisode, MediaType } from "../../../types";

interface Props {
	episode: UpcomingEpisode;
	onPress: (tmdbShowId: number) => void;
	onTitlePress?: (episode: UpcomingEpisode) => void;
	onEpisodePress?: (episode: UpcomingEpisode) => void;
}

export default memo(function UpcomingEpisodeRow({
	episode,
	onPress,
	onTitlePress,
	onEpisodePress,
}: Props) {
	const isMovie = episode.mediaType === MediaType.MOVIE;
	const label = isMovie
		? "MOVIE"
		: `S${String(episode.season).padStart(2, "0")} | E${String(episode.episode).padStart(2, "0")}`;
	// Right end of the middle line: local air time (TVMaze, only when the exact time is known),
	// or a movie's runtime
	const sideText = isMovie
		? formatRuntime(upcomingRuntime(episode))
		: formatAirTime(episode.airStamp);

	return (
		<TouchableOpacity
			style={[cardStyles.container, styles.row]}
			onPress={() => (onEpisodePress ? onEpisodePress(episode) : onPress(episode.tmdbShowId))}
			activeOpacity={0.7}
		>
			<PosterImage
				posterPath={episode.posterPath}
				mediaType={episode.mediaType}
				style={cardStyles.poster}
			/>
			<CardInfo
				title={episode.showTitle}
				onTitlePress={() =>
					onTitlePress ? onTitlePress(episode) : onPress(episode.tmdbShowId)
				}
				subline={isMovie ? upcomingDirector(episode) : episode.episodeTitle}
				sublineLines={isMovie ? 1 : 2}
				style={styles.info}
			>
				{/* Time on the middle line → the episode name / director gets the card's full width */}
				<View style={styles.epRow}>
					{isMovie ? (
						<View style={styles.movieBadge}>
							<Text style={styles.movieBadgeText}>MOVIE</Text>
						</View>
					) : (
						<Text style={cardStyles.episode}>{label}</Text>
					)}
					{sideText && (
						<View style={styles.side} pointerEvents="none">
							<Text style={styles.airTime} numberOfLines={1}>
								{sideText}
							</Text>
						</View>
					)}
				</View>
			</CardInfo>
		</TouchableOpacity>
	);
});

const styles = themedStyles(() => StyleSheet.create({
	row: {
		marginHorizontal: spacing.md,
		marginBottom: spacing.sm,
	},
	// No checkmark on the right: the text gets the padding instead
	info: { paddingRight: spacing.md },
	epRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		alignSelf: "stretch",
	},
	// Right end of the middle line, laid over it: the big time text would make the line taller
	// than the badge / SxxExx and unbalance the card's even gaps
	side: {
		position: "absolute",
		right: 0,
		top: -20,
		bottom: -20,
		justifyContent: "center",
	},
	// Air time / runtime. Wide enough for any "hh:mm AM": Android measures some times in this
	// font a hair narrow and cut the "AM" / "PM" off
	airTime: {
		flexShrink: 0,
		minWidth: 88,
		textAlign: "right",
		fontFamily: fonts.smoochMedium,
		fontSize: 20,
		letterSpacing: 0.5,
		color: colors.text,
	},
	movieBadge: {
		alignSelf: "flex-start",
		backgroundColor: colors.moviePurple,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		borderRadius: 4,
	},
	movieBadgeText: {
		fontSize: 10,
		fontWeight: "700",
		color: colors.text,
		letterSpacing: 0.5,
	},
}));
