import { HiCheck } from "react-icons/hi";
import { FaRegPauseCircle } from "react-icons/fa";
import { HistoryProgress } from "@app/enums";
import ProgressRing from "./ProgressRing";
import styles from "./styles/ProgressPill.module.scss";

interface Props {
	kind: HistoryProgress;
	/** PERCENT: 0–100 */
	percent?: number;
	/** The smaller size on a list card's tag line (Watch History's cards use the full size) */
	compact?: boolean;
}

const ICON_SIZE = 20;
const COMPACT_ICON_SIZE = 16;

/**
 * The progress pill — a percent ring, Up To Date or Paused — that Watch History's cards and a
 * list card's tag line both show (app ProgressPill). The icon / ring sits concentric with the
 * rounded left end: the left padding equals the vertical padding.
 */
export default function ProgressPill({ kind, percent = 0, compact = false }: Props) {
	const cls = `${styles.pill} ${compact ? styles.compact : ""}`;
	const size = compact ? COMPACT_ICON_SIZE : ICON_SIZE;
	if (kind === HistoryProgress.UP_TO_DATE) {
		return (
			<span className={`${cls} bg-watched`}>
				<HiCheck size={size} className="block shrink-0" />
				Up To Date
			</span>
		);
	}
	if (kind === HistoryProgress.PAUSED) {
		return (
			<span className={`${cls} bg-movie`}>
				<FaRegPauseCircle size={size} className="block shrink-0" />
				Paused
			</span>
		);
	}
	return (
		<span className={`${cls} bg-warning text-surface`}>
			<span className={styles.ring}>
				<ProgressRing percent={percent} />
			</span>
			{percent}%
		</span>
	);
}
