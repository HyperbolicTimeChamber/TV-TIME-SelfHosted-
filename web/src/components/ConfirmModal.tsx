import { Spin } from "antd";
import AnimatedModal from "./AnimatedModal";
import styles from "./styles/ui.module.scss";
import { cssVars } from "../utils/cssVars";

interface Props {
	visible: boolean;
	title: string;
	hint?: string;
	error?: string | null;
	confirmLabel: string;
	confirmColor?: string;
	loading?: boolean;
	onConfirm: () => void;
	onClose: () => void;
}

export default function ConfirmModal({
	visible,
	title,
	hint,
	error,
	confirmLabel,
	confirmColor,
	loading,
	onConfirm,
	onClose,
}: Props) {
	return (
		<AnimatedModal visible={visible} onClose={onClose}>
			<p className={styles.modalTitle}>{title}</p>
			{hint && <p className={styles.modalHint}>{hint}</p>}
			{error && <p className={styles.modalError}>{error}</p>}
			<button
				className={`${styles.button} ${styles.danger} ${confirmColor ? "bg-(--confirm)!" : ""}`}
				style={confirmColor ? cssVars({ "--confirm": confirmColor }) : undefined}
				onClick={onConfirm}
				disabled={loading}
			>
				{loading ? <Spin size="small" /> : confirmLabel}
			</button>
			<button className={styles.cancel} onClick={onClose}>
				Cancel
			</button>
		</AnimatedModal>
	);
}
