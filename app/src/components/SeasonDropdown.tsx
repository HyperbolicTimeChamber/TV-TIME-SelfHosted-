import React, { memo } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	StyleSheet,
	ActivityIndicator,
	LayoutAnimation,
	UIManager,
	Platform,
} from "react-native";
import { Image } from "expo-image";
import WatchActionSheet from "./modals/WatchActionSheet";
import ConfirmModal from "./modals/ConfirmModal";
import {
	ModalArt,
	ModalBackdrop,
	ModalLogo,
	SPEEDSTER_ART,
	SPEEDSTER_RATIO,
} from "./modals/ModalArt";
import { getCachedCatalogShow } from "../hooks/useWatchlist";
import { SKIP_AHEAD_TITLE, episodeRange, skipAheadConfirm, skipAheadHint } from "../utils/format";
import CheckmarkButton from "./CheckmarkButton";
import SkeletonLine from "./SkeletonLine";
import EpisodeDetailModal from "./modals/EpisodeDetailModal";
import { colors, spacing, typography } from "../theme";
import { withHaptic } from "../utils/haptics";
import { tmdbPosterUri, tmdbStillUri } from "../hooks/useTmdbImage";
import { MediaType, TMDBEpisode } from "../types";
import { useSeasonActions, type SeasonDropdownProps } from "./useSeasonActions";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
	UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(dateStr: string): string {
	const [y, m, d] = dateStr.split("-");
	return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

export default memo(function SeasonDropdown({
	tmdbId,
	season,
	showTitle,
	showPosterPath,
	showBackdropPath,
	isTracked,
	preloadedEpisodes,
	trackingItem,
	seasonLayout,
	episodesBySeason,
}: SeasonDropdownProps) {
	const {
		expanded,
		setExpanded,
		markingEps,
		markingSeason,
		skipModalVisible,
		setSkipModalVisible,
		skipModalData,
		setSkipModalData,
		epInfoVisible,
		setEpInfoVisible,
		epInfoData,
		setEpInfoData,
		addModalVisible,
		setAddModalVisible,
		addModalLoading,
		addModalError,
		pendingAction,
		handleAddAndMark,
		sheetVisible,
		setSheetVisible,
		sheetTarget,
		setSheetTarget,
		watchedMap,
		episodes,
		watchedCount,
		minWatchCount,
		allWatched,
		partiallyWatched,
		handleMarkWatched,
		jumpModal,
		setJumpModal,
		markOrAskJump,
		handleSheetAction,
		markEpisodeRange,
		handleEpisodePress,
		handleCarouselMark,
		handleCarouselMarkThrough,
		handleCarouselUnmark,
		handleEpisodeLongPress,
		handleRewatchBadgePress,
		handleCheckmarkPress,
		handleSeasonPress,
		seasonConfirmVisible,
		setSeasonConfirmVisible,
		confirmSeasonMark,
		handleSeasonLongPress,
		sheetLabel,
		isLoading,
		imagesLoading,
		watchedLoading,
	} = useSeasonActions({
		tmdbId,
		season,
		showTitle,
		showPosterPath,
		showBackdropPath,
		isTracked,
		preloadedEpisodes,
		trackingItem,
		seasonLayout,
		episodesBySeason,
	});

	const showLogo = getCachedCatalogShow(tmdbId, MediaType.TV)?.logoPath ?? null;

	return (
		<View>
			<TouchableOpacity
				style={styles.seasonRow}
				onPress={() => {
					LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
					setExpanded(!expanded);
				}}
			>
				<Image
					source={{
						uri: tmdbPosterUri(season.poster_path || showPosterPath || "", 45),
					}}
					style={styles.seasonPoster}
					contentFit="cover"
				/>
				<View style={styles.seasonInfo}>
					<Text style={styles.seasonName}>{season.name}</Text>
					<View style={styles.seasonMetaRow}>
						{watchedLoading ? (
							<ActivityIndicator size={10} color={colors.textMuted} style={{ marginRight: 4 }} />
						) : null}
						<Text style={styles.seasonMeta}>
							{watchedLoading ? "" : `${watchedCount}/`}
							{season.episode_count} episodes
							{season.air_date ? ` · ${formatDate(season.air_date)}` : ""}
						</Text>
					</View>
				</View>
				<View style={{ marginRight: spacing.sm }}>
					<CheckmarkButton
						size={30}
						watched={allWatched}
						loading={markingSeason || markingEps.size > 0}
						label={
							allWatched ? `x${minWatchCount}` : partiallyWatched ? `${watchedCount}` : undefined
						}
						labelColor={partiallyWatched ? colors.background : undefined}
						backgroundColor={partiallyWatched ? colors.text : undefined}
						onPress={handleSeasonPress}
						onLongPress={allWatched ? handleSeasonLongPress : undefined}
						disabled={markingEps.size > 0 || watchedLoading}
					/>
				</View>
				<Text style={styles.chevron}>{expanded ? "▾" : "›"}</Text>
			</TouchableOpacity>

			{expanded && (
				<View style={styles.episodeList}>
					{isLoading ? (
						<ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
					) : (
						episodes.map((ep: TMDBEpisode) => {
							const watched = watchedMap.get(ep.episode_number);
							const count = watched?.watchCount || 0;
							const isWatched = count > 0;

							const epLabel = `S${String(season.season_number).padStart(2, "0")}E${String(ep.episode_number).padStart(2, "0")}`;

							return (
								<View key={ep.episode_number} style={styles.episodeRow}>
									<TouchableOpacity
										style={styles.episodeInfo}
										onPress={() => handleEpisodePress(ep)}
										onLongPress={withHaptic(() => handleEpisodeLongPress(ep))}
										activeOpacity={0.7}
									>
										<View style={styles.epThumbWrap}>
											{imagesLoading ? (
												<SkeletonLine width={80} height={50} />
											) : ep.still_path ? (
												<Image
													source={{
														uri: tmdbStillUri(ep.still_path, 80),
													}}
													style={styles.epThumb}
													contentFit="cover"
												/>
											) : (
												<View style={styles.epThumbPlaceholder}>
													<Text style={styles.epThumbText}>
														E{String(ep.episode_number).padStart(2, "0")}
													</Text>
												</View>
											)}
										</View>
										<View style={styles.episodeText}>
											<Text style={styles.epLabel}>{epLabel}</Text>
											<Text style={styles.episodeName} numberOfLines={1}>
												{ep.name}
											</Text>
											{ep.air_date && (
												<Text style={styles.episodeMeta}>{formatDate(ep.air_date)}</Text>
											)}
											{count > 1 && (
												<TouchableOpacity
													onPress={() => handleRewatchBadgePress(ep)}
													hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
												>
													<Text style={styles.rewatchBadge}>Watched {count}x</Text>
												</TouchableOpacity>
											)}
										</View>
									</TouchableOpacity>
									<CheckmarkButton
										size={28}
										watched={isWatched}
										loading={markingEps.has(ep.episode_number) || markingSeason}
										label={isWatched ? `x${count}` : undefined}
										onPress={() => handleCheckmarkPress(ep)}
										onLongPress={
											isWatched
												? () => {
														setSheetTarget({
															type: "episode",
															ep,
															watchCount: count,
														});
														setSheetVisible(true);
													}
												: undefined
										}
										disabled={markingEps.size > 0 || markingSeason}
									/>
								</View>
							);
						})
					)}
				</View>
			)}

			<WatchActionSheet
				visible={sheetVisible}
				label={sheetLabel}
				watchCount={sheetTarget?.watchCount || 0}
				onSelect={handleSheetAction}
				onClose={() => {
					setSheetVisible(false);
					setSheetTarget(null);
				}}
			/>

			<ConfirmModal
				visible={addModalVisible}
				title="Add to Watchlist?"
				image={<ModalLogo logoPath={showLogo} title={showTitle} />}
				hint="This show isn't in your watchlist yet. Add it to mark episodes as watched."
				error={addModalError}
				confirmLabel="Add & Mark"
				confirmColor={colors.primary}
				loading={addModalLoading}
				onConfirm={handleAddAndMark}
				onClose={() => {
					setAddModalVisible(false);
					pendingAction.current = null;
				}}
			/>

			<ConfirmModal
				visible={seasonConfirmVisible}
				title={
					allWatched
						? `Rewatch Season ${season.season_number}?`
						: `Mark Season ${season.season_number} as Watched?`
				}
				image={
					showBackdropPath ? (
						<ModalBackdrop backdropPath={showBackdropPath} logoPath={showLogo} title={showTitle} />
					) : (
						<ModalLogo logoPath={showLogo} title={showTitle} />
					)
				}
				hint={
					allWatched
						? `Mark every episode of ${season.name} as watched again?`
						: `Mark all ${episodes.length} episodes of ${season.name} as watched?`
				}
				confirmLabel={allWatched ? "Rewatch Season" : "Mark Season"}
				confirmColor={colors.watchedGreen}
				onConfirm={confirmSeasonMark}
				onClose={() => setSeasonConfirmVisible(false)}
			/>

			{skipModalData && (
				<ConfirmModal
					visible={skipModalVisible}
					title={SKIP_AHEAD_TITLE}
					hideCancel
					image={<ModalArt source={SPEEDSTER_ART} ratio={SPEEDSTER_RATIO} />}
					hint={skipAheadHint(
						episodeRange(skipModalData.firstSkipped, skipModalData.targetEp.episode_number),
					)}
					confirmLabel={skipAheadConfirm(
						episodeRange(skipModalData.firstSkipped, skipModalData.targetEp.episode_number),
					)}
					confirmColor={colors.primary}
					onConfirm={() => {
						const d = skipModalData;
						setSkipModalVisible(false);
						markEpisodeRange(d.firstSkipped, d.targetEp.episode_number);
						setSkipModalData(null);
					}}
					secondaryLabel="Just This One"
					onSecondary={() => {
						const d = skipModalData;
						setSkipModalVisible(false);
						markOrAskJump(d.targetEp);
						setSkipModalData(null);
					}}
					onClose={() => {
						setSkipModalVisible(false);
						setSkipModalData(null);
					}}
				/>
			)}

			{jumpModal && (
				<ConfirmModal
					visible
					title={
						jumpModal.rewatch
							? "Start a Rewatch?"
							: jumpModal.skipsPrevious
								? "Skip Previous Episodes?"
								: "Watch From Here?"
					}
					image={<ModalLogo logoPath={showLogo} title={showTitle} />}
					hint={
						jumpModal.rewatch
							? `Rewatch from E${jumpModal.ep.episode_number}? Your watchlist will continue from the next episode.`
							: jumpModal.skipsPrevious
								? `Skip the earlier unwatched episodes and continue your watchlist after E${jumpModal.ep.episode_number}? They stay unwatched.`
								: `Continue watching from E${jumpModal.ep.episode_number}? Your watchlist will move to the next episode.`
					}
					confirmLabel={
						jumpModal.rewatch
							? "Rewatch From Here"
							: jumpModal.skipsPrevious
								? "Skip Previous"
								: "Watch From Here"
					}
					confirmColor={colors.primary}
					onConfirm={() => {
						const { ep } = jumpModal;
						setJumpModal(null);
						handleMarkWatched(ep, true);
					}}
					secondaryLabel="Just Mark It"
					onSecondary={() => {
						const { ep } = jumpModal;
						setJumpModal(null);
						handleMarkWatched(ep);
					}}
					onClose={() => setJumpModal(null)}
				/>
			)}

			{epInfoData && (
				<EpisodeDetailModal
					visible={epInfoVisible}
					tmdbId={epInfoData.tmdbId}
					showTitle={epInfoData.showTitle}
					showPosterPath={epInfoData.showPosterPath}
					showBackdropPath={epInfoData.showBackdropPath}
					episodes={epInfoData.episodes}
					initialIndex={epInfoData.initialIndex}
					watchedKeys={epInfoData.watchedKeys}
					currentNextEpisode={epInfoData.currentNextEpisode}
					onMarkWatched={handleCarouselMark}
					onMarkWatchedThrough={handleCarouselMarkThrough}
					onUnmarkWatched={handleCarouselUnmark}
					onClose={() => {
						setEpInfoVisible(false);
						setEpInfoData(null);
					}}
				/>
			)}
		</View>
	);
});

const styles = StyleSheet.create({
	seasonRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: spacing.sm,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
	},
	seasonPoster: {
		width: 45,
		height: 67,
		borderRadius: 4,
	},
	seasonInfo: {
		flex: 1,
		marginLeft: spacing.md,
	},
	seasonName: {
		...typography.subtitle,
		fontSize: 14,
	},
	seasonMetaRow: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: spacing.xs,
	},
	seasonMeta: {
		...typography.caption,
	},
	chevron: {
		...typography.title,
		color: colors.textMuted,
		fontSize: 18,
	},
	episodeList: {
		backgroundColor: colors.surface,
		borderRadius: 8,
		marginBottom: spacing.sm,
	},
	loader: {
		paddingVertical: spacing.lg,
	},
	episodeRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingRight: spacing.md,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
	},
	episodeInfo: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
	},
	epThumbWrap: {
		width: 80,
		height: 50,
		marginRight: spacing.md,
	},
	epThumb: {
		width: 80,
		height: 50,
	},
	epThumbPlaceholder: {
		width: 80,
		height: 50,
		backgroundColor: colors.surfaceLight,
		justifyContent: "center",
		alignItems: "center",
	},
	epThumbText: {
		fontSize: 11,
		fontWeight: "600",
		color: colors.textMuted,
	},
	episodeText: {
		flex: 1,
		marginLeft: spacing.sm,
	},
	epLabel: {
		...typography.caption,
		fontSize: 10,
		color: colors.textMuted,
		letterSpacing: 0.5,
		marginBottom: 1,
	},
	episodeName: {
		...typography.body,
		fontSize: 13,
	},
	episodeMeta: {
		...typography.caption,
		marginTop: 2,
		fontSize: 11,
	},
	rewatchBadge: {
		...typography.caption,
		color: colors.accent,
		marginTop: 2,
		fontSize: 11,
	},
});
