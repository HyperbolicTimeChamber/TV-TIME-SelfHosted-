import styles from "./styles/SlowLoadNote.module.scss";

/**
 * Info page: one small note under the first section still loading (Where to Watch) once the
 * extras take longer than SLOW_LOAD_MS. Fades in with a 4px rise (none under reduced motion); the
 * screen unmounts it the moment the data lands
 */
export default function SlowLoadNote() {
	return (
		<p className={styles.note} role="status">
			This is taking longer than usual…
		</p>
	);
}
