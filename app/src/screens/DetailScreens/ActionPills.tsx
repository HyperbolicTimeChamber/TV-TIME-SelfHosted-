import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { colors, spacing, typography } from "../../theme";
import { WatchStatus, MediaType } from "../../types";
import { withHaptic } from "../../utils/haptics";

interface Props {
	mediaType: MediaType;
	watchlistItem: any;
	adding: boolean;
	removing: boolean;
	movieWatchCount: number;
	/** TV only: any episode watched — "Rewatch" is meaningless otherwise */
	hasWatchedEpisodes?: boolean;
	/** Anything watched → no Remove (the watch history has to be cleared first) */
	hasStarted: boolean;
	onAddToWatchlist: () => void;
	onMarkMovieWatched: () => void;
	onResumeOrRewatch: () => void;
	/** TV watching / rewatching: pause it (asks first) */
	onPause: () => void;
	/** Completed TV: queue the next rewatch without starting it */
	onPauseRewatch: () => void;
	onRemove: () => void;
	/** Long-press on Rewatch: watch count sheet */
	onWatchSheetOpen: () => void;
}

export default function ActionPills({
	mediaType,
	watchlistItem,
	adding,
	removing,
	movieWatchCount,
	hasWatchedEpisodes = true,
	hasStarted,
	onAddToWatchlist,
	onMarkMovieWatched,
	onResumeOrRewatch,
	onPause,
	onPauseRewatch,
	onRemove,
	onWatchSheetOpen,
}: Readonly<Props>) {
	const isTv = mediaType === MediaType.TV;
	const completed = watchlistItem?.status === WatchStatus.COMPLETED;
	const neverWatched = isTv && completed && !hasWatchedEpisodes;
	// Completed show: two ways into the next run instead of Rewatch + Remove
	const rewatchChoice = isTv && completed && !neverWatched;
	const hasSheet = isTv ? rewatchChoice : movieWatchCount > 0;
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
					{mediaType === MediaType.MOVIE && watchlistItem.status !== WatchStatus.COMPLETED && (
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
					{(watchlistItem.status === WatchStatus.COMPLETED ||
						watchlistItem.status === WatchStatus.PAUSED ||
						watchlistItem.status === WatchStatus.PAUSED_REWATCH) && (
						<TouchableOpacity
							style={[styles.pill, styles.pillAccent]}
							onPress={onResumeOrRewatch}
							onLongPress={withHaptic(hasSheet ? onWatchSheetOpen : undefined)}
						>
							<Text style={styles.pillText}>
								{watchlistItem.status === WatchStatus.PAUSED
									? "Resume"
									: watchlistItem.status === WatchStatus.PAUSED_REWATCH
										? "Resume Rewatch"
										: neverWatched
											? "Start Watching"
											: rewatchChoice
												? "Start Rewatch"
												: "Rewatch"}
							</Text>
						</TouchableOpacity>
					)}
					{rewatchChoice && (
						<TouchableOpacity style={[styles.pill, styles.pillPause]} onPress={onPauseRewatch}>
							<Text style={styles.pillText}>Pause Rewatch</Text>
						</TouchableOpacity>
					)}
					{mediaType === MediaType.TV &&
						(watchlistItem.status === WatchStatus.WATCHING ||
							watchlistItem.status === WatchStatus.REWATCHING) && (
							<TouchableOpacity style={[styles.pill, styles.pillPause]} onPress={onPause}>
								<Text style={styles.pillText}>
									{watchlistItem.status === WatchStatus.REWATCHING ? "Pause Rewatch" : "Pause"}
								</Text>
							</TouchableOpacity>
						)}
					{!hasStarted && (
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
					)}
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
		marginTop: spacing.lg,
	},
	pill: {
		flex: 1,
		minWidth: 100,
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.md,
		borderRadius: 15,
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
	pillPause: {
		backgroundColor: colors.stopBlue,
	},
	pillRemove: {
		backgroundColor: colors.destructiveRed,
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
		color: colors.text,
	},
});
