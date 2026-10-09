import { Spin } from "antd";
import { MediaType, WatchStatus } from "@app/enums";
import { useLongPress } from "../../hooks/useLongPress";
import styles from "./ShowDetailScreen.module.css";

interface Props {
	mediaType: MediaType;
	watchlistItem: { status?: WatchStatus } | null;
	adding: boolean;
	removing: boolean;
	movieWatchCount: number;
	hasWatchedEpisodes?: boolean;
	onAddToWatchlist: () => void;
	onMarkMovieWatched: () => void;
	onResumeOrRewatch: () => void;
	onRemove: () => void;
	onMovieSheetOpen: () => void;
}

/** Same pills + states as the app's ActionPills */
export default function ActionPills(p: Props) {
	const status = p.watchlistItem?.status;
	const isMovie = p.mediaType === MediaType.MOVIE;
	const neverWatched = !isMovie && status === WatchStatus.COMPLETED && p.hasWatchedEpisodes === false;
	const rewatchPress = useLongPress(isMovie && p.movieWatchCount > 0 ? p.onMovieSheetOpen : undefined, p.onResumeOrRewatch);

	if (!p.watchlistItem) {
		return (
			<div className={styles.pillRow}>
				<button className={`${styles.pill} ${styles.pillPrimary}`} onClick={p.onAddToWatchlist} disabled={p.adding}>
					{p.adding ? <Spin size="small" /> : "+ Add to Watchlist"}
				</button>
				{isMovie && (
					<button className={`${styles.pill} ${styles.pillWatched}`} onClick={p.onMarkMovieWatched} disabled={p.adding}>
						{p.adding ? <Spin size="small" /> : "Watched"}
					</button>
				)}
			</div>
		);
	}

	const showResume =
		status === WatchStatus.COMPLETED || status === WatchStatus.PAUSED || status === WatchStatus.PAUSED_REWATCH;

	return (
		<div className={styles.pillRow}>
			{isMovie && status !== WatchStatus.COMPLETED && (
				<button className={`${styles.pill} ${styles.pillWatched}`} onClick={p.onMarkMovieWatched} disabled={p.adding}>
					{p.adding ? <Spin size="small" /> : "Mark as Watched"}
				</button>
			)}
			{isMovie && status === WatchStatus.COMPLETED && (
				<div className={`${styles.pill} ${styles.pillWatched}`} style={{ opacity: 0.7 }}>
					Watched ✓{p.movieWatchCount > 1 && <span className={styles.pillBadge}>{p.movieWatchCount}</span>}
				</div>
			)}
			{showResume && (
				<button className={`${styles.pill} ${styles.pillAccent}`} {...rewatchPress}>
					{status === WatchStatus.PAUSED
						? "Resume"
						: status === WatchStatus.PAUSED_REWATCH
							? "Resume Rewatch"
							: neverWatched
								? "Start Watching"
								: "Rewatch"}
				</button>
			)}
			<button className={`${styles.pill} ${styles.pillRemove}`} onClick={p.onRemove} disabled={p.removing}>
				{p.removing ? <Spin size="small" /> : "Remove"}
			</button>
		</div>
	);
}
