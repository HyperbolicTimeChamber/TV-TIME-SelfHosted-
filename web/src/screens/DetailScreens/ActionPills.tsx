import { HiCheck } from "react-icons/hi";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Spin } from "antd";
import { IoBookmark, IoBookmarkOutline, IoEllipsisVertical } from "react-icons/io5";
import {
	ADD_TO_WATCHLIST_LABELS,
	CircleButtonTone,
	MARK_WATCHED_LABELS,
	MediaType,
	WatchStatus,
} from "@app/enums";
import CircleButton from "../../components/CircleButton";
import styles from "./styles/ShowDetailScreen.module.scss";

const TICK_PX = 20;
const TICK_GAP_PX = 8;

/**
 * A pill's label, shortened to fit ("Mark as Watched" → "Mark Watched" → "Watched") instead of
 * wrapping onto two lines when the row is narrow. App: ActionPills FitLabel
 */
function FitLabel({ labels, icon }: { labels: readonly string[]; icon?: ReactNode }) {
	const box = useRef<HTMLSpanElement>(null);
	const measured = useRef<(HTMLSpanElement | null)[]>([]);
	const [label, setLabel] = useState<string>(labels[0]);
	const iconPx = icon ? TICK_PX + TICK_GAP_PX : 0;
	useLayoutEffect(() => {
		const el = box.current;
		if (!el) return;
		const fit = () => {
			const room = el.clientWidth;
			// Not laid out (yet): the full label
			if (room === 0) return setLabel(labels[0]);
			const i = labels.findIndex(
				(_, j) => (measured.current[j]?.offsetWidth ?? Infinity) + iconPx <= room,
			);
			setLabel(labels[i === -1 ? labels.length - 1 : i]);
		};
		fit();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(fit);
		observer.observe(el);
		return () => observer.disconnect();
	}, [labels, iconPx]);
	return (
		<span ref={box} className={styles.fitLabel}>
			{/* Every label measured off screen, never shown */}
			<span className={styles.fitMeasure} aria-hidden>
				{labels.map((l, i) => (
					<span key={l} ref={(n) => void (measured.current[i] = n)}>
						{l}
					</span>
				))}
			</span>
			{icon}
			{label}
		</span>
	);
}

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
	/** How many custom lists hold the title (bookmark filled, count on it, when above 0) */
	listCount: number;
	/** Add to List: the row's last button, whichever other buttons are showing */
	onAddToList: () => void;
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

	const listButton = (
		<CircleButton
			tone={p.listCount > 0 ? CircleButtonTone.ACCENT : CircleButtonTone.RAISED}
			onClick={p.onAddToList}
			ariaLabel={
				p.listCount > 0
					? `Add to List, in ${p.listCount} ${p.listCount === 1 ? "list" : "lists"}`
					: "Add to List"
			}
		>
			{p.listCount > 0 ? <IoBookmark size={26} /> : <IoBookmarkOutline size={22} />}
		</CircleButton>
	);

	if (!p.watchlistItem) {
		return (
			<div className={styles.pillRow}>
				<button
					className={`${styles.pill} ${styles.pillPrimary}`}
					onClick={p.onAddToWatchlist}
					disabled={p.adding}
				>
					{p.adding ? <Spin size="small" /> : <FitLabel labels={ADD_TO_WATCHLIST_LABELS} />}
				</button>
				{isMovie && (
					<button
						className={`${styles.pill} ${styles.pillWatched}`}
						onClick={p.onMarkMovieWatched}
						disabled={p.adding}
					>
						{p.adding ? (
							<Spin size="small" />
						) : (
							<FitLabel labels={MARK_WATCHED_LABELS} icon={<HiCheck size={TICK_PX} />} />
						)}
					</button>
				)}
				{listButton}
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
					{p.adding ? (
						<Spin size="small" />
					) : (
						<FitLabel labels={MARK_WATCHED_LABELS} icon={<HiCheck size={TICK_PX} />} />
					)}
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
			{listButton}
			{/* Watch count ⋯ stays the row's right-most button */}
			{hasSheet && (
				<CircleButton
					tone={CircleButtonTone.RAISED}
					onClick={p.onWatchSheetOpen}
					ariaLabel="Watch count options"
				>
					<IoEllipsisVertical size={22} />
				</CircleButton>
			)}
		</div>
	);
}
