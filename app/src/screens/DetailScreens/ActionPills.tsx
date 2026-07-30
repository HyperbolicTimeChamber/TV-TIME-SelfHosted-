import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { colors, spacing, typography } from "../../theme";
import { WatchStatus, MediaType } from "../../types";

interface Props {
	mediaType: MediaType;
	watchlistItem: any;
	adding: boolean;
	removing: boolean;
	movieWatchCount: number;
	onAddToWatchlist: () => void;
	onMarkMovieWatched: () => void;
	onResumeOrRewatch: () => void;
	onRemove: () => void;
	onMovieSheetOpen: () => void;
}

export default function ActionPills({
	mediaType,
	watchlistItem,
	adding,
	removing,
	movieWatchCount,
	onAddToWatchlist,
	onMarkMovieWatched,
	onResumeOrRewatch,
	onRemove,
	onMovieSheetOpen,
}: Props) {
	return (
		<View style={styles.pillRow}>
			{!watchlistItem ? (
				<>
					<TouchableOpacity
						style={[styles.pill, styles.pillPrimary, adding && styles.pillDisabled]}
						onPress={onAddToWatchlist}
						disabled={adding}
					>
						{adding ? (
							<ActivityIndicator size="small" color={colors.text} />
						) : (
							<Text style={styles.pillText}>+ Add to Watchlist</Text>
						)}
					</TouchableOpacity>
					{mediaType === MediaType.MOVIE && (
						<TouchableOpacity
							style={[styles.pill, styles.pillWatched, adding && styles.pillDisabled]}
							onPress={onMarkMovieWatched}
							disabled={adding}
						>
							{adding ? (
								<ActivityIndicator size="small" color={colors.text} />
							) : (
								<Text style={styles.pillText}>Watched</Text>
							)}
						</TouchableOpacity>
					)}
				</>
			) : (
				<>
					{mediaType === MediaType.MOVIE &&
						watchlistItem.status !== WatchStatus.COMPLETED && (
							<TouchableOpacity
								style={[styles.pill, styles.pillWatched, adding && styles.pillDisabled]}
								onPress={onMarkMovieWatched}
								disabled={adding}
							>
								{adding ? (
									<ActivityIndicator size="small" color={colors.text} />
								) : (
									<Text style={styles.pillText}>Mark as Watched</Text>
								)}
							</TouchableOpacity>
						)}
					{mediaType === MediaType.MOVIE &&
						watchlistItem.status === WatchStatus.COMPLETED && (
							<View style={[styles.pill, styles.pillWatched, { opacity: 0.7 }]}>
								<Text style={styles.pillText}>
									Watched{movieWatchCount > 0 ? ` ${movieWatchCount}x` : ""} {"\u2713"}
								</Text>
							</View>
						)}
					{(watchlistItem.status === WatchStatus.COMPLETED ||
						watchlistItem.status === WatchStatus.PAUSED ||
						watchlistItem.status === WatchStatus.PAUSED_REWATCH ||
						(watchlistItem.status === WatchStatus.WATCHING &&
							mediaType === MediaType.TV &&
							!watchlistItem.nextEpisode)) && (
						<TouchableOpacity
							style={[styles.pill, styles.pillAccent]}
							onPress={onResumeOrRewatch}
							onLongPress={
								mediaType === MediaType.MOVIE && movieWatchCount > 0
									? onMovieSheetOpen
									: undefined
							}
						>
							<Text style={styles.pillText}>
								{watchlistItem.status === WatchStatus.PAUSED
									? "Resume"
									: watchlistItem.status === WatchStatus.PAUSED_REWATCH
										? "Resume Rewatch"
										: "Rewatch"}
							</Text>
						</TouchableOpacity>
					)}
					<TouchableOpacity
						style={[styles.pill, styles.pillRemove, removing && styles.pillDisabled]}
						onPress={onRemove}
						disabled={removing}
					>
						{removing ? (
							<ActivityIndicator size="small" color={colors.destructiveRed} />
						) : (
							<Text style={styles.pillRemoveText}>Remove</Text>
						)}
					</TouchableOpacity>
				</>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	pillRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
		marginTop: spacing.md,
	},
	pill: {
		flex: 1,
		minWidth: 100,
		paddingVertical: spacing.sm,
		paddingHorizontal: spacing.md,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	pillPrimary: {
		backgroundColor: colors.primary,
	},
	pillWatched: {
		backgroundColor: colors.watchedGreen,
	},
	pillAccent: {
		backgroundColor: colors.accent,
	},
	pillRemove: {
		backgroundColor: "transparent",
		borderWidth: 1.5,
		borderColor: colors.destructiveRed,
	},
	pillDisabled: {
		opacity: 0.6,
	},
	pillText: {
		...typography.subtitle,
		fontSize: 13,
		color: colors.text,
	},
	pillRemoveText: {
		...typography.subtitle,
		fontSize: 13,
		color: colors.destructiveRed,
	},
});
