import AnimatedModal from "./AnimatedModal";
import loader from "./styles/PanLoader.module.scss";
import styles from "./styles/ui.module.scss";

/** Blocks the screen while exportAccountData runs (app ExportingModal): a pan tossing an egg */
export default function ExportingModal({ visible }: { visible: boolean }) {
	return (
		<AnimatedModal visible={visible} onClose={() => {}}>
			<p className={styles.modalTitle}>Preparing your data</p>
			<p className={styles.modalHint}>Let us cook</p>
			<div className={loader.stage} role="progressbar" aria-label="Preparing your data">
				<div className={loader.loader} />
			</div>
			<p className={styles.modalHint}>
				This may take a while for big accounts. Keep this tab open.
			</p>
		</AnimatedModal>
	);
}
