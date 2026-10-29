import { memo, useState } from "react";
import { Spin } from "antd";
import { AnimatePresence, motion } from "motion/react";
import { IoIosArrowDown } from "react-icons/io";
import { useSeasonActions, type SeasonDropdownProps } from "@app/components/useSeasonActions";
import { tmdbPosterUri, tmdbStillUri } from "@app/hooks/useTmdbImage";
import type { TMDBEpisode } from "@app/types";
import { colors } from "../theme/index";
import { useLongPress } from "../hooks/useLongPress";
import CheckmarkButton from "./CheckmarkButton";
import ConfirmModal from "./ConfirmModal";
import { HIT_A_WALL_ART, ModalArt, ModalBackdrop, ModalLogo, SPEEDSTER_ART } from "./ModalArt";
import { getCachedCatalogShow } from "@app/hooks/useWatchlist";
import { MediaType, WatchStatus } from "@app/enums";
import {
	SKIP_AHEAD_TITLE,
	episodeRange,
	skipAheadConfirm,
	skipAheadHint,
	startRewatchCopy,
} from "@app/utils/format";
import WatchActionSheet from "./WatchActionSheet";
import WatchCountSheet from "./WatchCountSheet";
import EpisodeDetailModal from "./EpisodeDetailModal";
import { formatDate } from "./EpisodeDetailModal/helpers";
import styles from "./styles/SeasonDropdown.module.scss";
import SkeletonBlock from "./SkeletonBlock";

type Props = SeasonDropdownProps & {
	/** Logged-out web visitors: browse only, no check buttons */
	readOnly?: boolean;
	/** Where this season sits in the show's list: only the list's outer corners are rounded */
	isFirst?: boolean;
	isLast?: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");
// Calendar's show-card accordion beat
const ACCORDION_S = 0.22;

function EpisodeRow({
	ep,
	seasonNumber,
	count,
	marking,
	disabled,
	imagesLoading,
	readOnly,
	groupBottom,
	onPress,
	onLongPress,
	onCheck,
}: {
	ep: TMDBEpisode;
	seasonNumber: number;
	count: number;
	marking: boolean;
	disabled: boolean;
	imagesLoading: boolean;
	readOnly?: boolean;
	/** Last episode of the last season: rounds off the bottom of the list */
	groupBottom: boolean;
	onPress: () => void;
	onLongPress: () => void;
	onCheck: () => void;
}) {
	const press = useLongPress(readOnly ? undefined : onLongPress, onPress);
	const isWatched = count > 0;
	return (
		<div className={`${styles.episodeRow} ${groupBottom ? styles.groupBottom : ""}`}>
			<div className={styles.episodeInfo} role="button" tabIndex={0} {...press}>
				<div className={styles.epThumbWrap}>
					{imagesLoading ? (
						<SkeletonBlock className={styles.epThumbSkeleton} />
					) : ep.still_path ? (
						<img
							src={tmdbStillUri(ep.still_path, 80)}
							alt=""
							className={styles.epThumb}
							loading="lazy"
						/>
					) : (
						<div className={styles.epThumbPlaceholder}>E{pad(ep.episode_number)}</div>
					)}
				</div>
				<div className={styles.episodeText}>
					<span className={styles.epLabel}>
						S{pad(seasonNumber)}E{pad(ep.episode_number)}
					</span>
					<span className={styles.episodeName}>{ep.name}</span>
					{ep.air_date && <span className={styles.episodeMeta}>{formatDate(ep.air_date)}</span>}
				</div>
			</div>
			{!readOnly && (
				<CheckmarkButton
					size={28}
					watched={isWatched}
					loading={marking}
					label={isWatched ? `x${count}` : undefined}
					onPress={onCheck}
					onLongPress={isWatched ? onLongPress : undefined}
					disabled={disabled}
				/>
			)}
		</div>
	);
}

/** Expandable season row with episode list (app SeasonDropdown) */
/** "Reduce Rewatch?" copy (app SeasonDropdown) */
function reduceRewatchHint(
	r: { kind: "episode"; ep: TMDBEpisode; to: number } | { kind: "season" } | null,
	floor: number,
	seasonNumber: number,
) {
	if (!r) return undefined;
	const pad = (n: number) => String(n).padStart(2, "0");
	const what =
		r.kind === "episode"
			? `S${pad(seasonNumber)}E${pad(r.ep.episode_number)} can't go below`
			: `Episodes of Season ${seasonNumber} can't go below`;
	return `${what} x${floor}, your rewatch count. Going lower drops your rewatch count to the lowest watch count left.`;
}

export default memo(function SeasonDropdown({ readOnly, isFirst, isLast, ...props }: Props) {
	const s = useSeasonActions(props);
	// While the episodes slide shut they still hang under the card, so it stays square till then
	const [closing, setClosing] = useState(false);
	const { season, showPosterPath } = props;
	const showLogo = getCachedCatalogShow(props.tmdbId, MediaType.TV)?.logoPath ?? null;

	// Rewatching (or one paused) → no "Watched Once": it'd wipe the earlier runs' watches
	const inRewatch =
		props.trackingItem?.status === WatchStatus.REWATCHING ||
		props.trackingItem?.status === WatchStatus.PAUSED_REWATCH;
	return (
		<div className={styles.season}>
			<div
				className={[
					styles.seasonRow,
					isFirst && styles.groupTop,
					// The last season rounds off the list, unless its episodes hang below it
					isLast && !s.expanded && !closing && styles.groupBottom,
				]
					.filter(Boolean)
					.join(" ")}
				role="button"
				tabIndex={0}
				onClick={() => {
					if (s.expanded) setClosing(true);
					s.setExpanded(!s.expanded);
				}}
			>
				<img
					src={tmdbPosterUri(season.poster_path || showPosterPath || "", 45)}
					alt=""
					className={styles.seasonPoster}
					loading="lazy"
				/>
				<div className={styles.seasonInfo}>
					<span className={styles.seasonName}>{season.name}</span>
					<span className={styles.seasonMeta}>
						{s.watchedLoading && !readOnly ? <Spin size="small" className="mr-1" /> : null}
						{s.watchedLoading || readOnly ? "" : `${s.watchedCount}/`}
						{season.episode_count} episodes
						{season.air_date ? ` · ${formatDate(season.air_date)}` : ""}
					</span>
				</div>
				{!readOnly && (
					<div className="mr-2" onClick={(e) => e.stopPropagation()}>
						<CheckmarkButton
							size={30}
							watched={s.allWatched}
							loading={s.markingSeason || s.markingEps.size > 0}
							label={
								s.allWatched
									? `x${s.minWatchCount}`
									: s.partiallyWatched
										? `${s.watchedCount}`
										: undefined
							}
							labelColor={s.partiallyWatched ? colors.background : undefined}
							backgroundColor={s.partiallyWatched ? colors.text : undefined}
							onPress={s.handleSeasonPress}
							onLongPress={s.handleSeasonLongPress}
							disabled={s.markingEps.size > 0 || s.watchedLoading}
							ariaLabel="Mark season watched"
						/>
					</div>
				)}
				<IoIosArrowDown
					size={24}
					className={`${styles.arrow} ${s.expanded ? styles.arrowOpen : ""}`}
				/>
			</div>

			<AnimatePresence initial={false} onExitComplete={() => setClosing(false)}>
				{s.expanded && (
					// Same accordion as Calendar's show cards: strips slide open, seasons below follow
					<motion.div
						className={styles.episodeList}
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: ACCORDION_S, ease: "easeInOut" }}
					>
						{s.isLoading ? (
							<div className={styles.loader}>
								<Spin />
							</div>
						) : (
							s.episodes.map((ep: TMDBEpisode, nth: number) => {
								const count = s.watchedMap.get(ep.episode_number)?.watchCount || 0;
								return (
									<EpisodeRow
										key={ep.episode_number}
										ep={ep}
										seasonNumber={season.season_number}
										count={count}
										marking={s.markingEps.has(ep.episode_number) || s.markingSeason}
										disabled={s.markingEps.size > 0 || s.markingSeason}
										imagesLoading={s.imagesLoading}
										readOnly={readOnly}
										groupBottom={!!isLast && nth === s.episodes.length - 1}
										onPress={() => s.handleEpisodePress(ep)}
										onLongPress={() => s.handleEpisodeLongPress(ep)}
										onCheck={() => s.handleCheckmarkPress(ep)}
									/>
								);
							})
						)}
					</motion.div>
				)}
			</AnimatePresence>

			{!readOnly && (
				<>
					{/* Season: the option list; episode: the −/+ watch count sheet (as on the watchlist) */}
					<WatchActionSheet
						visible={s.sheetVisible && s.sheetTarget?.type === "season"}
						title={props.showTitle}
						subtitle={s.sheetLabel}
						squareLabel={s.sheetSquareLabel}
						tmdbId={props.tmdbId}
						mediaType={MediaType.TV}
						logoPath={showLogo}
						watchCount={s.sheetTarget?.watchCount || 0}
						showWatchedOnce={!inRewatch}
						onSelect={s.handleSheetAction}
						onClose={() => {
							s.setSheetVisible(false);
							s.setSheetTarget(null);
						}}
					/>
					<WatchCountSheet
						visible={s.sheetVisible && s.sheetTarget?.type === "episode"}
						title={props.showTitle}
						subtitle={s.sheetLabel}
						episode={
							s.sheetTarget?.type === "episode"
								? { season: props.season.season_number, episode: s.sheetTarget.ep.episode_number }
								: undefined
						}
						centered={false}
						tmdbId={props.tmdbId}
						mediaType={MediaType.TV}
						logoPath={showLogo}
						watchCount={s.sheetTarget?.watchCount || 0}
						allowWatchedOnce={!inRewatch}
						confirmBelow={s.rewatchFloorCount}
						onCommit={s.handleEpisodeCountCommit}
						onClose={() => {
							s.setSheetVisible(false);
							s.setSheetTarget(null);
						}}
					/>

					<ConfirmModal
						visible={s.addModalVisible}
						title="Add to Watchlist?"
						image={
							<ModalLogo
								logoPath={showLogo}
								tmdbId={props.tmdbId}
								mediaType={MediaType.TV}
								title={props.showTitle}
							/>
						}
						hint="This show isn't in your watchlist yet. Add it to mark episodes as watched."
						error={s.addModalError}
						confirmLabel="Add & Mark"
						confirmColor={colors.primary}
						loading={s.addModalLoading}
						onConfirm={s.handleAddAndMark}
						onClose={() => {
							s.setAddModalVisible(false);
							s.pendingAction.current = null;
						}}
					/>

					<ConfirmModal
						visible={s.seasonConfirmVisible}
						title={s.seasonConfirmCopy.title}
						image={
							props.showBackdropPath ? (
								<ModalBackdrop
									backdropPath={props.showBackdropPath}
									logoPath={showLogo}
									tmdbId={props.tmdbId}
									mediaType={MediaType.TV}
									title={props.showTitle}
								/>
							) : (
								<ModalLogo
									logoPath={showLogo}
									tmdbId={props.tmdbId}
									mediaType={MediaType.TV}
									title={props.showTitle}
								/>
							)
						}
						hint={s.seasonConfirmCopy.hint}
						confirmLabel={s.seasonConfirmCopy.confirmLabel}
						confirmColor={colors.watchedGreen}
						onConfirm={s.confirmSeasonMark}
						secondaryLabel={s.seasonConfirmCopy.secondaryLabel}
						onSecondary={s.seasonConfirmCopy.secondaryLabel ? s.confirmSeasonMarkAll : undefined}
						onClose={() => s.setSeasonConfirmVisible(false)}
					/>

					{s.seasonSkip && s.seasonSkipCopy && (
						<ConfirmModal
							visible
							title={SKIP_AHEAD_TITLE}
							image={<ModalArt src={SPEEDSTER_ART} />}
							hint={s.seasonSkipCopy.hint}
							confirmLabel={s.seasonSkipCopy.confirmLabel}
							confirmColor={colors.primary}
							onConfirm={s.confirmSeasonSkipAll}
							secondaryLabel={s.seasonSkipCopy.secondaryLabel}
							onSecondary={s.confirmSeasonSkipJustThis}
							onClose={() => s.setSeasonSkip(null)}
						/>
					)}

					{/* A mark that would have started a rewatch with an aired episode still short */}
					<ConfirmModal
						visible={!!s.rewatchGate}
						title="Finish Watching First"
						image={
							<ModalLogo
								logoPath={showLogo}
								tmdbId={props.tmdbId}
								mediaType={MediaType.TV}
								title={props.showTitle}
							/>
						}
						hint={(() => {
							const g = s.rewatchGate;
							if (!g) return undefined;
							const pad = (n: number) => String(n).padStart(2, "0");
							const label = `S${pad(g.season)}E${pad(g.episode)}${g.name ? ` – ${g.name}` : ""}`;
							return `Those watches are saved, but rewatch ${g.count} can't start yet: ${label} isn't at x${g.count}. Every aired episode needs x${g.count} first.`;
						})()}
						confirmLabel="OK"
						confirmColor={colors.primary}
						hideCancel
						onConfirm={() => s.setRewatchGate(null)}
						onClose={() => s.setRewatchGate(null)}
					/>

					{/* Show page only: going under the rewatch floor asks first (app SeasonDropdown) */}
					<ConfirmModal
						visible={!!s.reduceRewatch}
						title="Oops, looks like you've hit a wall"
						image={<ModalArt src={HIT_A_WALL_ART} />}
						hint={reduceRewatchHint(
							s.reduceRewatch,
							s.rewatchFloorCount,
							props.season.season_number,
						)}
						confirmLabel="Reduce Rewatch"
						onConfirm={s.confirmReduceRewatch}
						onClose={() => s.setReduceRewatch(null)}
					/>

					{s.skipModalData && (
						<ConfirmModal
							visible={s.skipModalVisible}
							title={SKIP_AHEAD_TITLE}
							hideCancel
							image={<ModalArt src={SPEEDSTER_ART} />}
							hint={skipAheadHint(
								episodeRange(s.skipModalData.firstSkipped, s.skipModalData.targetEp.episode_number),
							)}
							confirmLabel={skipAheadConfirm(
								episodeRange(s.skipModalData.firstSkipped, s.skipModalData.targetEp.episode_number),
							)}
							confirmColor={colors.primary}
							onConfirm={s.confirmSkipAll}
							secondaryLabel="Just This One"
							onSecondary={s.confirmSkipJustThis}
							onClose={() => {
								s.setSkipModalVisible(false);
								s.setSkipModalData(null);
							}}
						/>
					)}

					{s.jumpModal?.rewatch &&
						(() => {
							const jm = s.jumpModal;
							const first = jm.upTo[0];
							const copy = startRewatchCopy({
								label: `S${pad(props.season.season_number)}E${pad(jm.ep.episode_number)}`,
								firstLabel: first ? `S${pad(first.season)}E${pad(first.episode)}` : "",
								upTo: jm.upTo.length,
							});
							const fromHere = () => {
								s.setJumpModal(null);
								s.handleMarkWatched(jm.ep, true);
							};
							const justMark = () => {
								s.setJumpModal(null);
								s.handleMarkWatched(jm.ep);
							};
							return (
								<ConfirmModal
									visible
									title="Start a Rewatch?"
									image={
										<ModalLogo
											logoPath={showLogo}
											tmdbId={props.tmdbId}
											mediaType={MediaType.TV}
											title={props.showTitle}
										/>
									}
									hint={copy.hint}
									confirmLabel={copy.confirmLabel}
									confirmColor={colors.primary}
									onConfirm={
										copy.tertiaryLabel
											? () => {
													s.setJumpModal(null);
													s.markRewatchUpTo(jm.upTo);
												}
											: fromHere
									}
									secondaryLabel={copy.secondaryLabel}
									onSecondary={copy.tertiaryLabel ? fromHere : justMark}
									tertiaryLabel={copy.tertiaryLabel}
									onTertiary={copy.tertiaryLabel ? justMark : undefined}
									onClose={() => s.setJumpModal(null)}
								/>
							);
						})()}

					{s.jumpModal && !s.jumpModal.rewatch && (
						<ConfirmModal
							visible
							title={
								s.jumpModal.rewatch
									? "Start a Rewatch?"
									: s.jumpModal.skipsPrevious
										? "Skip Previous Episodes?"
										: "Watch From Here?"
							}
							image={
								<ModalLogo
									logoPath={showLogo}
									tmdbId={props.tmdbId}
									mediaType={MediaType.TV}
									title={props.showTitle}
								/>
							}
							hint={
								s.jumpModal.rewatch
									? `Rewatch from E${s.jumpModal.ep.episode_number}? Your watchlist will continue from the next episode.`
									: s.jumpModal.skipsPrevious
										? s.jumpModal.inRewatch
											? `Skip the earlier episodes of this rewatch and continue after E${s.jumpModal.ep.episode_number}? They keep their watch count.`
											: `Skip the earlier unwatched episodes and continue your watchlist after E${s.jumpModal.ep.episode_number}? They stay unwatched.`
										: `Continue watching from E${s.jumpModal.ep.episode_number}? Your watchlist will move to the next episode.`
							}
							confirmLabel={
								s.jumpModal.rewatch
									? "Rewatch From Here"
									: s.jumpModal.skipsPrevious
										? "Skip Previous"
										: "Watch From Here"
							}
							confirmColor={colors.primary}
							onConfirm={() => {
								const { ep } = s.jumpModal!;
								s.setJumpModal(null);
								s.handleMarkWatched(ep, true);
							}}
							secondaryLabel="Just Mark It"
							onSecondary={() => {
								const { ep } = s.jumpModal!;
								s.setJumpModal(null);
								s.handleMarkWatched(ep);
							}}
							onClose={() => s.setJumpModal(null)}
						/>
					)}
				</>
			)}

			{s.epInfoData && (
				<EpisodeDetailModal
					visible={s.epInfoVisible}
					tmdbId={s.epInfoData.tmdbId}
					showTitle={s.epInfoData.showTitle}
					showPosterPath={s.epInfoData.showPosterPath}
					showBackdropPath={s.epInfoData.showBackdropPath}
					episodes={s.epInfoData.episodes}
					initialIndex={s.epInfoData.initialIndex}
					watchedKeys={s.epInfoData.watchedKeys}
					currentNextEpisode={s.epInfoData.currentNextEpisode}
					rewatchCount={s.epInfoData.rewatchCount}
					readOnly={readOnly}
					onMarkWatched={s.handleCarouselMark}
					onMarkWatchedThrough={s.handleCarouselMarkThrough}
					onUnmarkWatched={s.handleCarouselUnmark}
					onClose={() => s.setEpInfoVisible(false)}
				/>
			)}
		</div>
	);
});
