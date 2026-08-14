import { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, spacing, typography } from "../../../theme";
import PosterImage from "../../../components/PosterImage";
import { UpcomingEpisode, MediaType } from "../../../types";

const POSTER_WIDTH = 100;

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

	return (
		<TouchableOpacity
			style={styles.row}
			onPress={() => (onEpisodePress ? onEpisodePress(episode) : onPress(episode.tmdbShowId))}
			activeOpacity={0.7}
		>
			<PosterImage
				posterPath={episode.posterPath}
				mediaType={episode.mediaType}
				size="medium"
				style={styles.poster}
			/>
			<View style={styles.info}>
				<TouchableOpacity
					style={styles.titlePill}
					onPress={() => (onTitlePress ? onTitlePress(episode) : onPress(episode.tmdbShowId))}
					activeOpacity={0.7}
				>
					<Text style={styles.titleText} numberOfLines={1}>
						{episode.showTitle.toUpperCase()}
					</Text>
					<Text style={styles.titleArrow}>›</Text>
				</TouchableOpacity>
				{isMovie ? (
					<View style={styles.movieBadge}>
						<Text style={styles.movieBadgeText}>MOVIE</Text>
					</View>
				) : (
					<>
						<Text style={styles.epLabel}>{label}</Text>
						{episode.episodeTitle ? (
							<Text style={styles.epTitle} numberOfLines={1}>
								{episode.episodeTitle}
							</Text>
						) : null}
					</>
				)}
			</View>
		</TouchableOpacity>
	);
});

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		backgroundColor: colors.background,
		borderRadius: 8,
		overflow: "hidden",
		marginHorizontal: spacing.md,
		marginBottom: spacing.sm,
		minHeight: POSTER_WIDTH,
	},
	poster: {
		width: POSTER_WIDTH,
		minHeight: POSTER_WIDTH,
		alignSelf: "stretch",
	},
	info: {
		flex: 1,
		justifyContent: "center",
		paddingVertical: spacing.sm,
		paddingLeft: spacing.md,
		paddingRight: spacing.xs,
	},
	titlePill: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		borderWidth: 1.5,
		borderColor: colors.text,
		borderRadius: 14,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		marginBottom: spacing.md,
		maxWidth: "90%",
	},
	titleText: {
		fontSize: 11,
		fontWeight: "600",
		color: colors.text,
		flexShrink: 1,
		letterSpacing: 0.5,
	},
	titleArrow: {
		fontSize: 11,
		color: colors.text,
		marginLeft: spacing.xs,
		lineHeight: 13,
	},
	epLabel: {
		...typography.subtitle,
		fontSize: 16,
		fontWeight: "700",
		color: colors.text,
		letterSpacing: 1,
	},
	epTitle: {
		...typography.body,
		color: colors.textSecondary,
		marginTop: 2,
		fontSize: 13,
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
