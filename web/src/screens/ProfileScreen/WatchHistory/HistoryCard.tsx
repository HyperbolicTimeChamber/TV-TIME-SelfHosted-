import { memo } from "react";
import { HistoryPill } from "@app/enums";
import type { HistoryCard as Card } from "@app/utils";
import { tmdbBackdropUri, tmdbLogoUri } from "@app/hooks/useTmdbImage";
import WatchCountPill from "../../../components/WatchCountPill";
import StatusPill from "../../../components/StatusPill";
import ProgressPill from "./ProgressPill";
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

/** Watch History card (app HistoryCardView) */
function HistoryCard({ card, onClick }: { card: Card; onClick: () => void }) {
	return (
		<button className={styles.card} onClick={onClick} aria-label={card.title}>
			{card.backdropPath && (
				<img
					src={tmdbBackdropUri(card.backdropPath, CARD_MAX_WIDTH)}
					alt=""
					className={styles.cardBg}
					loading="lazy"
				/>
			)}
			<span className={styles.cardOverlay} />

			<span className={styles.topBlock}>
				<span className={styles.topRow}>
					<span className={styles.logoSlot}>
						{card.logoPath ? (
							<img
								src={tmdbLogoUri(card.logoPath, CARD_MAX_WIDTH * 0.7)}
								alt={card.title}
								className={styles.logo}
								loading="lazy"
							/>
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
					{card.pill && card.pillLabel && (
						<StatusPill
							label={card.pillLabel}
							bgClass={PILL_BG[card.pill]}
							count={card.pillCount}
						/>
					)}
					{card.progress ? (
						<ProgressPill kind={card.progress.kind} percent={card.progress.percent} />
					) : card.watchCount != null ? (
						<WatchCountPill count={card.watchCount} />
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
