import React, { memo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import Reanimated from "react-native-reanimated";
import AccordionArrow, { CascadeStrip, useAccordion } from "./AccordionArrow";
import WatchActionSheet from "./modals/WatchActionSheet";
import WatchCountSheet from "./modals/WatchCountSheet";
import ConfirmModal from "./modals/ConfirmModal";
import {
	ModalArt,
	ModalBackdrop,
	ModalLogo,
	SPEEDSTER_ART,
	SPEEDSTER_RATIO,
} from "./modals/ModalArt";
import { getCachedCatalogShow } from "../hooks/useWatchlist";
import {
	SKIP_AHEAD_TITLE,
	episodeRange,
	skipAheadConfirm,
	skipAheadHint,
	startRewatchCopy,
} from "../utils/format";
import CheckmarkButton from "./CheckmarkButton";
import SkeletonLine from "./SkeletonLine";
import EpisodeDetailModal from "./modals/EpisodeDetailModal";
import { colors, spacing, typography } from "../theme";
import { withHaptic } from "../utils/haptics";
import { tmdbPosterUri, tmdbStillUri } from "../hooks/useTmdbImage";
import { MediaType, TMDBEpisode, WatchStatus } from "../types";
import { useSeasonActions, type SeasonDropdownProps } from "./useSeasonActions";

/** Every episode card is this tall (the 50px thumb inset 6px top and bottom), so a season's list
 *  height is known up front instead of measured */
const EP_ROW_H = 62;
/** Hairline gap under the season card and between episodes */
const STRIP_GAP = 2;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(dateStr: string): string {
	const [y, m, d] = dateStr.split("-");
	return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

/** Where this season sits in the show's list: only the list's outer corners are rounded */
type Props = SeasonDropdownProps & { isFirst?: boolean; isLast?: boolean };

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
	isFirst,
	isLast,
}: Props) {
	const {
		expanded,
		setExpanded,
		markingEps,
		markingSeason,
		skipModalVisible,
		setSkipModalVisible,
		skipModalData,
		confirmSkipAll,
		confirmSkipJustThis,
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
		handleSheetAction,
		handleEpisodePress,
		handleCarouselMark,
		handleCarouselMarkThrough,
		handleCarouselUnmark,
		handleEpisodeLongPress,
		handleCheckmarkPress,
		handleSeasonPress,
		seasonConfirmCopy,
		seasonConfirmVisible,
		setSeasonConfirmVisible,
		confirmSeasonMark,
		confirmSeasonMarkAll,
		seasonSkip,
		setSeasonSkip,
		seasonSkipCopy,
		confirmSeasonSkipAll,
		confirmSeasonSkipJustThis,
		markRewatchUpTo,
		handleSeasonLongPress,
		sheetLabel,
		sheetSquareLabel,
		handleEpisodeCountCommit,
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
	// Seasons below an opening/closing one glide to their new spot, as Calendar's cards do
	// Episode cards are a fixed height, so the list's height is known before it renders
	const accordion = useAccordion(
		expanded,
		isLoading ? undefined : episodes.length * (EP_ROW_H + STRIP_GAP),
	);

	// Rewatching (or one paused) → no "Watched Once": it'd wipe the earlier runs' watches
	const inRewatch =
		trackingItem?.status === WatchStatus.REWATCHING ||
		trackingItem?.status === WatchStatus.PAUSED_REWATCH;

	return (
		<View style={styles.season}>
			<TouchableOpacity
				style={[
					styles.seasonRow,
					isFirst && styles.groupTop,
					// The last season rounds off the list, unless its episodes hang below it
					isLast && !accordion.mounted && styles.groupBottom,
				]}
				activeOpacity={0.85}
				onPress={() => setExpanded(!expanded)}
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
				<AccordionArrow open={expanded} size={24} />
			</TouchableOpacity>

			{/* Episodes as Calendar's strips: each its own card, cascading in under the season */}
			{accordion.mounted && (
				<Reanimated.View style={accordion.style}>
					<View style={styles.stripStack} onLayout={accordion.onContentLayout}>
						{isLoading ? (
							<ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
						) : (
							episodes.map((ep: TMDBEpisode, nth: number) => {
								const watched = watchedMap.get(ep.episode_number);
								const count = watched?.watchCount || 0;
								const isWatched = count > 0;

								const epLabel = `S${String(season.season_number).padStart(2, "0")}E${String(ep.episode_number).padStart(2, "0")}`;

								return (
									<CascadeStrip
										key={ep.episode_number}
										style={[
											styles.episodeRow,
											isLast && nth === episodes.length - 1 && styles.groupBottom,
										]}
										nth={nth}
									>
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
									</CascadeStrip>
								);
							})
						)}
					</View>
				</Reanimated.View>
			)}

			{/* Season: the option list; episode: the −/+ watch count sheet (as on the watchlist) */}
			<WatchActionSheet
				visible={sheetVisible && sheetTarget?.type === "season"}
				title={showTitle}
				subtitle={sheetLabel}
				squareLabel={sheetSquareLabel}
				tmdbId={tmdbId}
				mediaType={MediaType.TV}
				logoPath={showLogo}
				watchCount={sheetTarget?.watchCount || 0}
				showWatchedOnce={!inRewatch}
				onSelect={handleSheetAction}
				onClose={() => {
					setSheetVisible(false);
					setSheetTarget(null);
				}}
			/>
			<WatchCountSheet
				visible={sheetVisible && sheetTarget?.type === "episode"}
				title={showTitle}
				subtitle={sheetLabel}
				episode={
					sheetTarget?.type === "episode"
						? { season: season.season_number, episode: sheetTarget.ep.episode_number }
						: undefined
				}
				centered={false}
				tmdbId={tmdbId}
				mediaType={MediaType.TV}
				logoPath={showLogo}
				watchCount={sheetTarget?.watchCount || 0}
				allowWatchedOnce={!inRewatch}
				onCommit={handleEpisodeCountCommit}
				onClose={() => {
					setSheetVisible(false);
					setSheetTarget(null);
				}}
			/>

			<ConfirmModal
				visible={addModalVisible}
				title="Add to Watchlist?"
				image={
					<ModalLogo
						logoPath={showLogo}
						tmdbId={tmdbId}
						mediaType={MediaType.TV}
						title={showTitle}
					/>
				}
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
				title={seasonConfirmCopy.title}
				image={
					showBackdropPath ? (
						<ModalBackdrop
							backdropPath={showBackdropPath}
							logoPath={showLogo}
							tmdbId={tmdbId}
							mediaType={MediaType.TV}
							title={showTitle}
						/>
					) : (
						<ModalLogo
							logoPath={showLogo}
							tmdbId={tmdbId}
							mediaType={MediaType.TV}
							title={showTitle}
						/>
					)
				}
				hint={seasonConfirmCopy.hint}
				confirmLabel={seasonConfirmCopy.confirmLabel}
				confirmColor={colors.watchedGreen}
				onConfirm={confirmSeasonMark}
				secondaryLabel={seasonConfirmCopy.secondaryLabel}
				onSecondary={seasonConfirmCopy.secondaryLabel ? confirmSeasonMarkAll : undefined}
				onClose={() => setSeasonConfirmVisible(false)}
			/>

			{seasonSkip && seasonSkipCopy && (
				<ConfirmModal
					visible
					title={SKIP_AHEAD_TITLE}
					image={<ModalArt source={SPEEDSTER_ART} ratio={SPEEDSTER_RATIO} />}
					hint={seasonSkipCopy.hint}
					confirmLabel={seasonSkipCopy.confirmLabel}
					confirmColor={colors.primary}
					onConfirm={confirmSeasonSkipAll}
					secondaryLabel={seasonSkipCopy.secondaryLabel}
					onSecondary={confirmSeasonSkipJustThis}
					onClose={() => setSeasonSkip(null)}
				/>
			)}

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
					onConfirm={confirmSkipAll}
					secondaryLabel="Just This One"
					onSecondary={confirmSkipJustThis}
					onClose={() => {
						setSkipModalVisible(false);
						setSkipModalData(null);
					}}
				/>
			)}

			{jumpModal &&
				jumpModal.rewatch &&
				(() => {
					const pad = (n: number) => String(n).padStart(2, "0");
					const first = jumpModal.upTo[0];
					const copy = startRewatchCopy({
						label: `S${pad(season.season_number)}E${pad(jumpModal.ep.episode_number)}`,
						firstLabel: first ? `S${pad(first.season)}E${pad(first.episode)}` : "",
						upTo: jumpModal.upTo.length,
					});
					const { ep, upTo } = jumpModal;
					const fromHere = () => {
						setJumpModal(null);
						handleMarkWatched(ep, true);
					};
					const justMark = () => {
						setJumpModal(null);
						handleMarkWatched(ep);
					};
					return (
						<ConfirmModal
							visible
							title="Start a Rewatch?"
							image={
								<ModalLogo
									logoPath={showLogo}
									tmdbId={tmdbId}
									mediaType={MediaType.TV}
									title={showTitle}
								/>
							}
							hint={copy.hint}
							confirmLabel={copy.confirmLabel}
							confirmColor={colors.primary}
							onConfirm={
								copy.tertiaryLabel
									? () => {
											setJumpModal(null);
											markRewatchUpTo(upTo);
										}
									: fromHere
							}
							secondaryLabel={copy.secondaryLabel}
							onSecondary={copy.tertiaryLabel ? fromHere : justMark}
							tertiaryLabel={copy.tertiaryLabel}
							onTertiary={copy.tertiaryLabel ? justMark : undefined}
							onClose={() => setJumpModal(null)}
						/>
					);
				})()}

			{jumpModal && !jumpModal.rewatch && (
				<ConfirmModal
					visible
					title={
						jumpModal.rewatch
							? "Start a Rewatch?"
							: jumpModal.skipsPrevious
								? "Skip Previous Episodes?"
								: "Watch From Here?"
					}
					image={
						<ModalLogo
							logoPath={showLogo}
							tmdbId={tmdbId}
							mediaType={MediaType.TV}
							title={showTitle}
						/>
					}
					hint={
						jumpModal.rewatch
							? `Rewatch from E${jumpModal.ep.episode_number}? Your watchlist will continue from the next episode.`
							: jumpModal.skipsPrevious
								? jumpModal.inRewatch
									? `Skip the earlier episodes of this rewatch and continue after E${jumpModal.ep.episode_number}? They keep their watch count.`
									: `Skip the earlier unwatched episodes and continue your watchlist after E${jumpModal.ep.episode_number}? They stay unwatched.`
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
					rewatchCount={epInfoData.rewatchCount}
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
	// Same hairline gap as the episodes, under the whole dropdown so an open one's episodes hang
	// just under its card
	season: {
		marginBottom: 2,
	},
	// Seasons and their open episodes read as one list: square where they meet, rounded only at
	// the list's top and bottom (groupTop / groupBottom). The poster runs flush to the card's
	// edges, so the card is only as tall as the poster
	seasonRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingRight: spacing.md,
		overflow: "hidden",
		backgroundColor: colors.surface,
	},
	groupTop: {
		borderTopLeftRadius: 16,
		borderTopRightRadius: 16,
	},
	groupBottom: {
		borderBottomLeftRadius: 16,
		borderBottomRightRadius: 16,
	},
	seasonPoster: {
		width: 45,
		height: 67,
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
	// Strips at their full height, whatever the accordion box around them shows
	stripStack: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		paddingTop: STRIP_GAP,
		gap: STRIP_GAP,
	},
	loader: {
		paddingVertical: spacing.lg,
	},
	// Same strip as the episodes under an opened Calendar card: the thumb inset 6px all round
	episodeRow: {
		height: EP_ROW_H,
		flexDirection: "row",
		alignItems: "center",
		paddingLeft: 6,
		paddingRight: spacing.md,
		overflow: "hidden",
		backgroundColor: colors.surface,
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
		borderRadius: 8,
		overflow: "hidden",
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
});
