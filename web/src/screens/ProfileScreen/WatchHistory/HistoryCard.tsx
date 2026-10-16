import { memo } from "react";
import { FaRegCheckCircle, FaRegPauseCircle } from "react-icons/fa";
import { HistoryPill, HistoryProgress } from "@app/enums";
import type { HistoryCard as Card } from "@app/utils";
import { tmdbBackdropUri, tmdbLogoUri } from "@app/hooks/useTmdbImage";
import ProgressRing from "./ProgressRing";
import styles from "./styles/WatchHistory.module.scss";

/** Status colours at 60% — translucent over the backdrop */
/** Widest a card gets (1-col phone ≈ 380, grid columns ≈ 350) — × devicePixelRatio picks the TMDB size */
const CARD_MAX_WIDTH = 400;

const PILL_BG: Record<HistoryPill, string> = {
	[HistoryPill.WATCHING]: "bg-stop/60",
	[HistoryPill.REWATCHING]: "bg-stop/60",
	[HistoryPill.COMPLETED]: "bg-watched/60",
	[HistoryPill.PAUSED]: "bg-danger/60",
};
/** Icons match the progress ring's 20px so all three pills line up */
const ICON_SIZE = 20;

function ProgressModule({ progress }: { progress: NonNullable<Card["progress"]> }) {
	if (progress.kind === HistoryProgress.UP_TO_DATE) {
		return (
			<span className={`${styles.progressPill} bg-watched`}>
				<FaRegCheckCircle size={ICON_SIZE} className="block shrink-0" />
				Up To Date
			</span>
		);
	}
	if (progress.kind === HistoryProgress.PAUSED) {
		return (
			<span className={`${styles.progressPill} bg-movie`}>
				<FaRegPauseCircle size={ICON_SIZE} className="block shrink-0" />
				Paused
			</span>
		);
	}
	return (
		<span className={`${styles.progressPill} bg-warning text-surface`}>
			<ProgressRing percent={progress.percent ?? 0} />
			{progress.percent ?? 0}%
		</span>
	);
}

/** Watch History card (app HistoryCardView) */
function HistoryCard({ card, onClick }: { card: Card; onClick: () => void }) {
	return (
		<button className={styles.card} onClick={onClick} aria-label={card.title}>
			{card.backdropPath && (
				<img src={tmdbBackdropUri(card.backdropPath, CARD_MAX_WIDTH)} alt="" className={styles.cardBg} loading="lazy" />
			)}
			<span className={styles.cardOverlay} />

			<span className={styles.topBlock}>
				<span className={styles.topRow}>
					{/* Logo when TMDB has one (name only as the fallback) */}
					<span className={styles.logoSlot}>
						{card.logoPath ? (
							<img src={tmdbLogoUri(card.logoPath, CARD_MAX_WIDTH * 0.7)} alt={card.title} className={styles.logo} loading="lazy" />
						) : (
							<span className={styles.cardTitle}>{card.title}</span>
						)}
					</span>
					{card.tag && <span className={styles.tagPill}>{card.tag}</span>}
				</span>
			</span>

			<span className={styles.bottomRow}>
				{/* Bottom-left: status pill above one slot — progress / up to date / paused,
				    else the watch count */}
				<span className={styles.leftBlock}>
					{card.pill && (
						<span className={`${styles.pill} ${card.pillCount != null ? styles.pillWithCount : ""} ${PILL_BG[card.pill]}`}>
							{card.pillLabel}
							{card.pillCount != null && <span className={styles.pillCountCircle}>{card.pillCount}</span>}
						</span>
					)}
					{card.progress ? (
						<ProgressModule progress={card.progress} />
					) : card.watchCount != null ? (
						<span className={`${styles.progressPill} ${styles.watchCountPill}`}>
							Watch Count <span className={styles.countCircle}>{card.watchCount}</span>
						</span>
					) : null}
				</span>
				{(card.lastWatched || card.timeSpent) && (
					<span className={styles.timeBlock}>
						{card.lastWatched && (
							<>
								<span className={styles.timeLabel}>Last Watched</span>
								<span className={`${styles.timeSpent} ${styles.statGap}`}>{card.lastWatched}</span>
							</>
						)}
						{card.timeSpent && (
							<>
								<span className={styles.timeLabel}>Total Time Spent</span>
								<span className={styles.timeSpent}>{card.timeSpent}</span>
							</>
						)}
					</span>
				)}
			</span>
		</button>
	);
}

export default memo(HistoryCard);
