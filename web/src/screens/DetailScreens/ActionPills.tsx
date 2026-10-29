import { Spin } from "antd";
import { IoEllipsisHorizontal } from "react-icons/io5";
import { CircleButtonTone, MediaType, WatchStatus } from "@app/enums";
import CircleButton from "../../components/CircleButton";
import styles from "./styles/ShowDetailScreen.module.scss";

interface Props {
	mediaType: MediaType;
	watchlistItem: { status?: WatchStatus } | null;
	adding: boolean;
	removing: boolean;
	movieWatchCount: number;
	hasWatchedEpisodes?: boolean;
	/** Anything watched → no Remove (the watch history has to be cleared first) */
	hasStarted: boolean;
	onAddToWatchlist: () => void;
	onMarkMovieWatched: () => void;
	onResumeOrRewatch: () => void;
	onPause: () => void;
	onRemove: () => void;
	/** Movie ⋯ beside Rewatch: watch count sheet */
	onWatchSheetOpen: () => void;
}

/** Same pills + states as the app's ActionPills */
export default function ActionPills(p: Props) {
	const status = p.watchlistItem?.status;
	const isMovie = p.mediaType === MediaType.MOVIE;
	const completed = status === WatchStatus.COMPLETED;
	const neverWatched = !isMovie && completed && p.hasWatchedEpisodes === false;
	// Completed show: "Start a Rewatch" (it reads "Pause a Rewatch" once the run is under way)
	const rewatchChoice = !isMovie && completed && !neverWatched;
	// Watch count sheet (⋯ at the row's end, like Settings beside Hall of Shame)
	const hasSheet = isMovie && completed && p.movieWatchCount > 0;

	if (!p.watchlistItem) {
		return (
			<div className={styles.pillRow}>
				<button
					className={`${styles.pill} ${styles.pillPrimary}`}
					onClick={p.onAddToWatchlist}
					disabled={p.adding}
				>
					{p.adding ? <Spin size="small" /> : "+ Add to Watchlist"}
				</button>
				{isMovie && (
					<button
						className={`${styles.pill} ${styles.pillWatched}`}
						onClick={p.onMarkMovieWatched}
						disabled={p.adding}
					>
						{p.adding ? <Spin size="small" /> : "Watched"}
					</button>
				)}
			</div>
		);
	}

	const showResume =
		status === WatchStatus.COMPLETED ||
		status === WatchStatus.PAUSED ||
		status === WatchStatus.PAUSED_REWATCH;

	return (
		<div className={styles.pillRow}>
			{isMovie && status !== WatchStatus.COMPLETED && (
				<button
					className={`${styles.pill} ${styles.pillWatched}`}
					onClick={p.onMarkMovieWatched}
					disabled={p.adding}
				>
					{p.adding ? <Spin size="small" /> : "Mark as Watched"}
				</button>
			)}
			{showResume && (
				<button className={`${styles.pill} ${styles.pillAccent}`} onClick={p.onResumeOrRewatch}>
					{status === WatchStatus.PAUSED
						? "Resume"
						: status === WatchStatus.PAUSED_REWATCH
							? "Resume Rewatch"
							: neverWatched
								? "Start Watching"
								: rewatchChoice
									? "Start a Rewatch"
									: "Rewatch"}
				</button>
			)}
			{hasSheet && (
				<CircleButton
					tone={CircleButtonTone.RAISED}
					onClick={p.onWatchSheetOpen}
					ariaLabel="Watch count options"
				>
					<IoEllipsisHorizontal size={22} />
				</CircleButton>
			)}
			{!isMovie && (status === WatchStatus.WATCHING || status === WatchStatus.REWATCHING) && (
				<button className={`${styles.pill} ${styles.pillPause}`} onClick={p.onPause}>
					{status === WatchStatus.REWATCHING ? "Pause a Rewatch" : "Pause"}
				</button>
			)}
			{!p.hasStarted && (
				<button
					className={`${styles.pill} ${styles.pillRemove}`}
					onClick={p.onRemove}
					disabled={p.removing}
				>
					{p.removing ? <Spin size="small" /> : "Remove"}
				</button>
			)}
		</div>
	);
}
