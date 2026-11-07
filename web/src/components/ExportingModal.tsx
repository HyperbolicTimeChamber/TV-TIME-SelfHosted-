import type { ReactNode } from "react";
import AnimatedModal from "./AnimatedModal";
import loader from "./styles/PanLoader.module.scss";
import styles from "./styles/ui.module.scss";

interface Props {
	visible: boolean;
	title?: string;
	/** What's being exported / imported ("Movies · To watch") */
	/** The line under the title ("Let us cook") */
	hint?: string;
	/** What's being exported, under the hint ("Movies · To be watched") */
	detail?: string;
	/** Shown as a Cancel button (the export stops server-side too) */
	onCancel?: () => void;
	/** Replaces the pan (e.g. the import's PacmanLoader) */
	loader?: ReactNode;
}

/**
 * Blocks the screen while an export / import runs (app ExportingModal): a pan tossing an egg.
 * Can't be dismissed — a click outside or Escape does nothing; only Cancel (when given) ends it
 */
export default function ExportingModal({
	visible,
	title = "Preparing your data",
	hint = "Let us cook",
	detail,
	onCancel,
	loader: customLoader,
}: Props) {
	return (
		<AnimatedModal visible={visible} onClose={() => {}} dismissable={false}>
			<p className={styles.modalTitle}>{title}</p>
			<p className={styles.modalHint}>{hint}</p>
			{detail && <p className={`${styles.modalHint} ${styles.modalDetail}`}>{detail}</p>}
			{customLoader ?? (
				<div className={loader.stage} role="progressbar" aria-label={title}>
					<div className={loader.loader} />
				</div>
			)}
			<p className={styles.modalHint}>
				This may take a while for big accounts. Keep this tab open.
			</p>
			{onCancel && (
				<button className={`${styles.button} ${styles.exportCancel}`} onClick={onCancel}>
					Cancel
				</button>
			)}
		</AnimatedModal>
	);
}
