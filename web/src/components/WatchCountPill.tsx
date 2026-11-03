import styles from "./styles/WatchCountPill.module.scss";

interface Props {
	count: number;
	label?: string;
	/** The smaller size on a list card's tag line (Watch History's cards use the full size) */
	compact?: boolean;
}

/**
 * "Watch Count" + the count in a lighter grey circle on the pill's right end (app WatchCountPill) —
 * the one pill Watch History's cards and a list card's tag line both show.
 */
export default function WatchCountPill({ count, label = "Watch Count", compact = false }: Props) {
	return (
		<span className={`${styles.pill} ${compact ? styles.compact : ""}`}>
			{label} <span className={styles.circle}>{count}</span>
		</span>
	);
}
