import { memo } from "react";
import { Spin } from "antd";
import { AnimatePresence, motion } from "motion/react";
import { useSeasonActions, type SeasonDropdownProps } from "@app/components/useSeasonActions";
import { tmdbPosterUri, tmdbStillUri } from "@app/hooks/useTmdbImage";
import type { TMDBEpisode } from "@app/types";
import { colors } from "../theme/index";
import { useLongPress } from "../hooks/useLongPress";
import CheckmarkButton from "./CheckmarkButton";
import ConfirmModal from "./ConfirmModal";
import { ModalArt, ModalLogo, ModalPoster, SPEEDSTER_ART } from "./ModalArt";
import { getCachedCatalogShow } from "@app/hooks/useWatchlist";
import { MediaType } from "@app/enums";
import { SKIP_AHEAD_TITLE, episodeRange, skipAheadConfirm, skipAheadHint } from "@app/utils/format";
import WatchActionSheet from "./WatchActionSheet";
import EpisodeDetailModal from "./EpisodeDetailModal";
import { formatDate } from "./EpisodeDetailModal/helpers";
import styles from "./styles/SeasonDropdown.module.scss";

type Props = SeasonDropdownProps & {
	/** Logged-out web visitors: browse only, no check buttons */
	readOnly?: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

function EpisodeRow({
	ep,
	seasonNumber,
	count,
	marking,
	disabled,
	imagesLoading,
	readOnly,
	onPress,
	onLongPress,
	onCheck,
	onBadge,
}: {
	ep: TMDBEpisode;
	seasonNumber: number;
	count: number;
	marking: boolean;
	disabled: boolean;
	imagesLoading: boolean;
	readOnly?: boolean;
	onPress: () => void;
	onLongPress: () => void;
	onCheck: () => void;
	onBadge: () => void;
}) {
	const press = useLongPress(readOnly ? undefined : onLongPress, onPress);
	const isWatched = count > 0;
	return (
		<div className={styles.episodeRow}>
			<div className={styles.episodeInfo} role="button" tabIndex={0} {...press}>
				<div className={styles.epThumbWrap}>
					{imagesLoading ? (
						<div className={`${styles.epThumbPlaceholder} ${styles.shimmer}`} />
					) : ep.still_path ? (
						<img src={tmdbStillUri(ep.still_path, 80)} alt="" className={styles.epThumb} loading="lazy" />
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
					{count > 1 && !readOnly && (
						<button
							className={styles.rewatchBadge}
							onClick={(e) => {
								e.stopPropagation();
								onBadge();
							}}
						>
							Watched {count}x
						</button>
					)}
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
export default memo(function SeasonDropdown({ readOnly, ...props }: Props) {
	const s = useSeasonActions(props);
	const { season, showPosterPath } = props;
	const showLogo = getCachedCatalogShow(props.tmdbId, MediaType.TV)?.logoPath ?? null;

	return (
		<div>
			<div className={styles.seasonRow} role="button" tabIndex={0} onClick={() => s.setExpanded(!s.expanded)}>
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
							label={s.allWatched ? `x${s.minWatchCount}` : s.partiallyWatched ? `${s.watchedCount}` : undefined}
							labelColor={s.partiallyWatched ? colors.background : undefined}
							backgroundColor={s.partiallyWatched ? colors.text : undefined}
							onPress={s.handleSeasonPress}
							onLongPress={s.handleSeasonLongPress}
							disabled={s.markingEps.size > 0 || s.watchedLoading}
							ariaLabel="Mark season watched"
						/>
					</div>
				)}
				<span className={styles.chevron}>{s.expanded ? "▾" : "›"}</span>
			</div>

			<AnimatePresence initial={false}>
				{s.expanded && (
					<motion.div
						className={styles.episodeList}
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.25, ease: "easeInOut" }}
					>
						{s.isLoading ? (
							<div className={styles.loader}>
								<Spin />
							</div>
						) : (
							s.episodes.map((ep: TMDBEpisode) => {
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
										onPress={() => s.handleEpisodePress(ep)}
										onLongPress={() => s.handleEpisodeLongPress(ep)}
										onCheck={() => s.handleCheckmarkPress(ep)}
										onBadge={() => s.handleRewatchBadgePress(ep)}
									/>
								);
							})
						)}
					</motion.div>
				)}
			</AnimatePresence>

			{!readOnly && (
				<>
					<WatchActionSheet
						visible={s.sheetVisible}
						label={s.sheetLabel}
						watchCount={s.sheetTarget?.watchCount || 0}
						onSelect={s.handleSheetAction}
						onClose={() => {
							s.setSheetVisible(false);
							s.setSheetTarget(null);
						}}
					/>

					<ConfirmModal
						visible={s.addModalVisible}
						title="Add to Watchlist?"
						image={<ModalLogo logoPath={showLogo} title={props.showTitle} />}
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
						title={s.allWatched ? `Rewatch Season ${season.season_number}?` : `Mark Season ${season.season_number} as Watched?`}
						image={season.poster_path || showPosterPath ? <ModalPoster posterPath={(season.poster_path || showPosterPath)!} /> : undefined}
						hint={
							s.allWatched
								? `Mark every episode of ${season.name} as watched again?`
								: `Mark all ${s.episodes.length} episodes of ${season.name} as watched?`
						}
						confirmLabel={s.allWatched ? "Rewatch Season" : "Mark Season"}
						confirmColor={colors.watchedGreen}
						onConfirm={s.confirmSeasonMark}
						onClose={() => s.setSeasonConfirmVisible(false)}
					/>

					{s.skipModalData && (
						<ConfirmModal
							visible={s.skipModalVisible}
							title={SKIP_AHEAD_TITLE}
							image={<ModalArt src={SPEEDSTER_ART} />}
							hint={skipAheadHint(episodeRange(s.skipModalData.firstSkipped, s.skipModalData.targetEp.episode_number))}
							confirmLabel={skipAheadConfirm(episodeRange(s.skipModalData.firstSkipped, s.skipModalData.targetEp.episode_number))}
							confirmColor={colors.primary}
							onConfirm={() => {
								const d = s.skipModalData!;
								s.setSkipModalVisible(false);
								s.markEpisodeRange(d.firstSkipped, d.targetEp.episode_number);
								s.setSkipModalData(null);
							}}
							secondaryLabel="Just This One"
							onSecondary={() => {
								const d = s.skipModalData!;
								s.setSkipModalVisible(false);
								s.markOrAskJump(d.targetEp);
								s.setSkipModalData(null);
							}}
							onClose={() => {
								s.setSkipModalVisible(false);
								s.setSkipModalData(null);
							}}
						/>
					)}

					{s.jumpModal && (
						<ConfirmModal
							visible
							title={
								s.jumpModal.rewatch
									? "Start a Rewatch?"
									: s.jumpModal.skipsPrevious
										? "Skip Previous Episodes?"
										: "Watch From Here?"
							}
							image={<ModalLogo logoPath={showLogo} title={props.showTitle} />}
							hint={
								s.jumpModal.rewatch
									? `Rewatch from E${s.jumpModal.ep.episode_number}? Your watchlist will continue from the next episode.`
									: s.jumpModal.skipsPrevious
										? `Skip the earlier unwatched episodes and continue your watchlist after E${s.jumpModal.ep.episode_number}? They stay unwatched.`
										: `Continue watching from E${s.jumpModal.ep.episode_number}? Your watchlist will move to the next episode.`
							}
							confirmLabel={
								s.jumpModal.rewatch ? "Rewatch From Here" : s.jumpModal.skipsPrevious ? "Skip Previous" : "Watch From Here"
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
