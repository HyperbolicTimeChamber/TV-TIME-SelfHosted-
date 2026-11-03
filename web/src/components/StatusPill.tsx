import styles from "./styles/StatusPill.module.scss";

interface Props {
	label: string;
	/** The pill's background (a utility class, e.g. bg-watched/60) */
	bgClass: string;
	/** Rewatch run: a white circle on the pill's right end */
	count?: number | null;
	/** The smaller size on a list card's tag line (Watch History's cards use the full size) */
	compact?: boolean;
}

/**
 * The status pill (Currently Watching / Rewatching / Completed) Watch History's cards and a list
 * card's tag line both show (app StatusPill). With a count, the circle sits concentric with the
 * rounded end: the right padding equals the vertical padding.
 */
export default function StatusPill({ label, bgClass, count, compact = false }: Props) {
	return (
		<span
			className={`${styles.pill} ${count != null ? styles.withCount : ""} ${compact ? styles.compact : ""} ${bgClass}`}
		>
			{label}
			{count != null && <span className={styles.circle}>{count}</span>}
		</span>
	);
}
