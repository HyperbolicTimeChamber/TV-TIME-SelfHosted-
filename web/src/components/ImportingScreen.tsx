import { useEffect, type ReactNode } from "react";
import PoweredByTmdb from "./PoweredByTmdb";
import styles from "./styles/ImportingScreen.module.scss";

interface Props {
	title: string;
	/** Under the title (e.g. "Om nom nom") */
	hint?: string;
	loader: ReactNode;
	/** Paragraphs under the loader */
	lines: string[];
	/** Shown as a Cancel button */
	onCancel?: () => void;
}

/**
 * The full screen an import holds the app on (app ImportingScreen): a fixed overlay above
 * everything, body scroll locked, TMDB credit at the bottom.
 */
export default function ImportingScreen({ title, hint, loader, lines, onCancel }: Props) {
	useEffect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = prev;
		};
	}, []);

	return (
		<div className={styles.screen} role="dialog" aria-modal="true" aria-label={title}>
			<div className={styles.body}>
				<h1 className={styles.title}>{title}</h1>
				{hint && <p className={styles.hint}>{hint}</p>}
				<div className={styles.loader}>{loader}</div>
				{lines.map((line) => (
					<p key={line} className={styles.desc}>
						{line}
					</p>
				))}
				{onCancel && (
					<button type="button" className={styles.cancel} onClick={onCancel}>
						Cancel
					</button>
				)}
			</div>
			<PoweredByTmdb className={styles.credit} />
		</div>
	);
}
