import styles from "./styles/WatchCountPill.module.scss";

/** "Watched (n)" — the number in a white circle (app WatchCountPill) */
export default function WatchCountPill({
	count,
	className = "",
}: {
	count: number;
	className?: string;
}) {
	return (
		<span
			className={`${styles.pill} ${className}`}
			aria-label={`Watched ${count} ${count === 1 ? "time" : "times"}`}
		>
			Watched
			<span className={styles.circle}>{count}</span>
		</span>
	);
}
