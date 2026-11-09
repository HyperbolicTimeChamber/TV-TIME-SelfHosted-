import styles from "./styles/PacmanLoader.module.scss";

/** The importing loader: a chomping Pac-Man eating dots that slide in (app PacmanLoader) */
export default function PacmanLoader({ label }: { label: string }) {
	return (
		<div className={styles.stage} role="progressbar" aria-label={label}>
			<div className={styles.circles}>
				<span className={styles.one} />
				<span className={styles.two} />
				<span className={styles.three} />
			</div>
			<div className={styles.pacman}>
				<span className={styles.top} />
				<span className={styles.bottom} />
				<span className={styles.left} />
				<div className={styles.eye} />
			</div>
		</div>
	);
}
