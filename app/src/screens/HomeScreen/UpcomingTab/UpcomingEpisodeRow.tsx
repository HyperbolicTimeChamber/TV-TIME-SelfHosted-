import { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, spacing, typography } from "../../../theme";
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

	return (
		<TouchableOpacity
			style={styles.row}
			onPress={() => (onEpisodePress ? onEpisodePress(episode) : onPress(episode.tmdbShowId))}
			activeOpacity={0.7}
		>
			<PosterImage
				posterPath={episode.posterPath}
				mediaType={episode.mediaType}
				style={styles.poster}
			/>
			<View style={styles.info}>
				<TouchableOpacity
					style={styles.titleButton}
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
					<Text style={styles.epLabel}>{label}</Text>
				)}
				<Text style={styles.epTitle} numberOfLines={1}>
					{episode.episodeTitle}
				</Text>
			</View>
		</TouchableOpacity>
	);
});

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.sm,
		backgroundColor: colors.surface,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
	},
	poster: {
		width: 45,
		height: 67,
		borderRadius: 4,
	},
	noPoster: {
		backgroundColor: colors.surfaceLight,
		justifyContent: "center",
		alignItems: "center",
	},
	noPosterText: {
		...typography.subtitle,
		color: colors.textMuted,
	},
	info: {
		flex: 1,
		marginLeft: spacing.md,
	},
	titleButton: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		borderWidth: 1.5,
		borderColor: colors.text,
		borderRadius: 14,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		marginBottom: spacing.sm,
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
	epTitle: {
		...typography.body,
		color: colors.text,
		marginTop: 2,
		fontSize: 13,
	},
});
