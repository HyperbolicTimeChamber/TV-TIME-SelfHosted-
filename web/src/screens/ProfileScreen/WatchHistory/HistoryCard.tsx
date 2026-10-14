import { memo } from "react";
import { FaRegCheckCircle, FaRegPauseCircle } from "react-icons/fa";
import { HistoryPill, HistoryProgress } from "@app/enums";
import type { HistoryCard as Card } from "@app/utils";
import { tmdbBackdropUri, tmdbLogoUri } from "@app/hooks/useTmdbImage";
import ProgressRing from "./ProgressRing";
import styles from "./styles/WatchHistory.module.scss";

/** Status colours at 60% — translucent over the backdrop */
const PILL_BG: Record<HistoryPill, string> = {
	[HistoryPill.WATCHING]: "bg-stop/60",
	[HistoryPill.REWATCHING]: "bg-stop/60",
	[HistoryPill.COMPLETED]: "bg-watched/60",
	[HistoryPill.PAUSED]: "bg-movie/60",
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
				<img src={tmdbBackdropUri(card.backdropPath, 600)} alt="" className={styles.cardBg} loading="lazy" />
			)}
			<span className={styles.cardOverlay} />

			<span className={styles.topBlock}>
				<span className={styles.topRow}>
					{card.logoPath ? <img src={tmdbLogoUri(card.logoPath, 160)} alt="" className={styles.logo} loading="lazy" /> : <span />}
					{card.pill && <span className={`${styles.pill} ${PILL_BG[card.pill]}`}>{card.pill}</span>}
				</span>
				<span className={styles.cardTitle}>{card.title}</span>
				{card.tag && <span className={styles.tagPill}>{card.tag}</span>}
			</span>

			<span className={styles.bottomRow}>
				{card.progress ? <ProgressModule progress={card.progress} /> : <span />}
				<span className={styles.timeBlock}>
					<span className={`${styles.timeSpent} block`}>{card.timeSpent}</span>
					{card.watchCount != null && (
						<span className={`${styles.tagPill} ${styles.watchCountPill}`}>
							Watch Count <span className={styles.countCircle}>{card.watchCount}</span>
						</span>
					)}
				</span>
			</span>
		</button>
	);
}

export default memo(HistoryCard);
