import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "../../theme";
import { WatchStatus, MediaType } from "../../types";
import { CircleButtonTone } from "../../enums";
import CircleButton from "../../components/CircleButton";

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
	onRemove: () => void;
	/** Movie ⋯ beside Rewatch: watch count sheet */
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
	onRemove,
	onWatchSheetOpen,
}: Readonly<Props>) {
	const isTv = mediaType === MediaType.TV;
	const completed = watchlistItem?.status === WatchStatus.COMPLETED;
	const neverWatched = isTv && completed && !hasWatchedEpisodes;
	// Completed show: "Start a Rewatch" (it reads "Pause a Rewatch" once the run is under way)
	const rewatchChoice = isTv && completed && !neverWatched;
	// Watch count sheet (⋯ at the row's end, like Settings beside Hall of Shame)
	const hasSheet = !isTv && completed && movieWatchCount > 0;
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
						<TouchableOpacity style={[styles.pill, styles.pillAccent]} onPress={onResumeOrRewatch}>
							<Text style={styles.pillText}>
								{watchlistItem.status === WatchStatus.PAUSED
									? "Resume"
									: watchlistItem.status === WatchStatus.PAUSED_REWATCH
										? "Resume Rewatch"
										: neverWatched
											? "Start Watching"
											: rewatchChoice
												? "Start a Rewatch"
												: "Rewatch"}
							</Text>
						</TouchableOpacity>
					)}
					{hasSheet && (
						<CircleButton
							tone={CircleButtonTone.RAISED}
							onPress={onWatchSheetOpen}
							accessibilityLabel="Watch count options"
						>
							<Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
						</CircleButton>
					)}
					{mediaType === MediaType.TV &&
						(watchlistItem.status === WatchStatus.WATCHING ||
							watchlistItem.status === WatchStatus.REWATCHING) && (
							<TouchableOpacity style={[styles.pill, styles.pillPause]} onPress={onPause}>
								<Text style={styles.pillText}>
									{watchlistItem.status === WatchStatus.REWATCHING ? "Pause a Rewatch" : "Pause"}
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
		alignItems: "center",
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
