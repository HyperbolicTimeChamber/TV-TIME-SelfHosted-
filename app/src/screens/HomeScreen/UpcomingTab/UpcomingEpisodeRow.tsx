import { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, fonts, spacing } from "../../../theme";
import CardInfo, { cardStyles } from "../../../components/CardInfo";
import { upcomingDirector } from "../../../hooks/useUpcomingEpisodes";
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
	// Local air time (TVMaze) — only when the exact time is known
	const airTime = isMovie ? null : formatAirTime(episode.airStamp);

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
				{isMovie ? (
					<View style={styles.movieBadge}>
						<Text style={styles.movieBadgeText}>MOVIE</Text>
					</View>
				) : (
					// Time on the SxxExx line → the episode name gets the card's full width
					<View style={styles.epRow}>
						<Text style={cardStyles.episode}>{label}</Text>
						{airTime && (
							<Text style={styles.airTime} numberOfLines={1}>
								{airTime}
							</Text>
						)}
					</View>
				)}
			</CardInfo>
		</TouchableOpacity>
	);
});

const styles = StyleSheet.create({
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
	// Right end of the SxxExx line
	// Wide enough for any "hh:mm AM": Android measures some times in this font a hair narrow and
	// cut the "AM" / "PM" off
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
});
