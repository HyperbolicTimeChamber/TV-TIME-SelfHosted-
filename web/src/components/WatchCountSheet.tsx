import { useCallback, useEffect, useRef, useState } from "react";
import { IoCheckmarkCircleOutline, IoRepeat, IoTrashOutline } from "react-icons/io5";
import { FaCircleMinus, FaCirclePlus } from "react-icons/fa6";
import type { MediaType } from "@app/enums";
import BottomSheet, {
	SheetCollapse,
	EpisodeSquare,
	SheetGroup,
	SheetHeader,
	SheetIcon,
	SheetOption,
	sheetStyles as styles,
} from "./BottomSheet";
import { colors } from "../theme/index";

/** Taps settle this long before the count is written — quick +/+/+ is one write, not three */
const COMMIT_DELAY_MS = 700;

interface Props {
	visible: boolean;
	title: string;
	tmdbId?: number;
	mediaType?: MediaType;
	logoPath?: string | null;
	/** Under the logo (watchlist episode: "Chapter 1") */
	subtitle?: string;
	/** Watchlist episode: calendar-style SEASON / Exx square beside the logo */
	episode?: { season: number; episode: number };
	/** Info page: logo alone, centred (default). Watchlist: logo left */
	centered?: boolean;
	watchCount: number;
	/** Settled change from → to (0 = unwatched) */
	onCommit: (from: number, to: number) => void;
	onClose: () => void;
}

/** Watch count sheet (info page + watchlist): − / + stepper (app WatchCountSheet) */
export default function WatchCountSheet({
	visible,
	title,
	tmdbId,
	mediaType,
	logoPath,
	subtitle,
	episode,
	centered = true,
	watchCount,
	onCommit,
	onClose,
}: Props) {
	const [count, setCount] = useState(watchCount);
	// Last value written (or the stored one) — the next commit's starting point
	const committed = useRef(watchCount);
	const pending = useRef(watchCount);
	const timer = useRef<number | null>(null);

	// Opening: this title's count in the same render (set in an effect, the last title's count
	// showed for a frame — a "Watched Once" from a 3+ title unfolded, then folded away). Rows
	// therefore mount straight into their state; only − / + animate them
	const [openFor, setOpenFor] = useState(visible);
	if (visible !== openFor) {
		setOpenFor(visible);
		if (visible) setCount(watchCount);
	}
	useEffect(() => {
		if (!visible) return;
		committed.current = watchCount;
		pending.current = watchCount;
		// Only on open: the stored count catching up mid-edit must not reset the stepper
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [visible]);

	// Latest onCommit without making flush (and the unmount flush below) change every render
	const onCommitRef = useRef(onCommit);
	onCommitRef.current = onCommit;
	const flush = useCallback(() => {
		if (timer.current) window.clearTimeout(timer.current);
		timer.current = null;
		if (pending.current === committed.current) return;
		onCommitRef.current(committed.current, pending.current);
		committed.current = pending.current;
	}, []);

	// Leaving the page mid-edit still saves it
	useEffect(() => flush, [flush]);

	/** Jump straight to `n` and write it now (no debounce) — "Watched Once" / "Not Watched" */
	const setNow = (n: number) => {
		pending.current = n;
		setCount(n);
		flush();
	};

	const step = (delta: number) => {
		const next = Math.max(0, pending.current + delta);
		if (next === pending.current) return;
		pending.current = next;
		setCount(next);
		if (timer.current) window.clearTimeout(timer.current);
		timer.current = window.setTimeout(flush, COMMIT_DELAY_MS);
	};

	return (
		<BottomSheet
			visible={visible}
			label={title}
			onClose={() => {
				flush();
				onClose();
			}}
		>
			<SheetHeader
				title={title}
				subtitle={subtitle}
				tmdbId={tmdbId}
				mediaType={mediaType}
				logoPath={logoPath}
				centered={centered}
				aside={
					episode ? <EpisodeSquare season={episode.season} episode={episode.episode} /> : undefined
				}
			/>
			<SheetGroup>
				<div className={styles.row}>
					<SheetIcon icon={IoRepeat} color={colors.accent} />
					<span className={styles.rowContent}>
						<span className={styles.rowText}>Watch Count</span>
						<span className={styles.rowHint}>
							{count === 0 ? "Not watched yet" : "Times you've watched it"}
						</span>
					</span>
					<div className={styles.stepper}>
						<button
							type="button"
							className={styles.step}
							aria-label="Watched once less"
							disabled={count === 0}
							onClick={() => step(-1)}
						>
							<FaCircleMinus size={28} />
						</button>
						<span className={styles.value} aria-live="polite">
							{count}
						</span>
						<button
							type="button"
							className={styles.step}
							aria-label="Watched once more"
							onClick={() => step(1)}
						>
							<FaCirclePlus size={28} />
						</button>
					</div>
				</div>
				{/* At 2, − already lands on 1 */}
				<SheetCollapse open={count > 2}>
					<SheetOption
						icon={IoCheckmarkCircleOutline}
						color={colors.watchedGreen}
						title="Watched Once"
						hint="Reset to 1x"
						onClick={() => {
							setNow(1);
							onClose();
						}}
					/>
				</SheetCollapse>
				<SheetCollapse open={count > 0}>
					<SheetOption
						icon={IoTrashOutline}
						color={colors.destructiveRed}
						title="Not Watched"
						hint="Remove all watch history"
						destructive
						onClick={() => {
							setNow(0);
							onClose();
						}}
					/>
				</SheetCollapse>
			</SheetGroup>
		</BottomSheet>
	);
}
