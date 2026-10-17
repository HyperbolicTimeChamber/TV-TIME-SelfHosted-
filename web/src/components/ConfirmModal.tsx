import { Spin } from "antd";
import AnimatedModal from "./AnimatedModal";
import styles from "./styles/ui.module.scss";
import { cssVars } from "../utils/cssVars";

interface Props {
	visible: boolean;
	title: string;
	/** Art between the title and the hint */
	image?: string;
	hint?: string;
	error?: string | null;
	confirmLabel: string;
	confirmColor?: string;
	/** Spinner in the confirm button; the other buttons are locked while it runs */
	loading?: boolean;
	onConfirm: () => void;
	/** Optional second choice under the confirm button (e.g. "Just This One") */
	secondaryLabel?: string;
	secondaryColor?: string;
	onSecondary?: () => void;
	cancelLabel?: string;
	onClose: () => void;
}

/** Every confirm / choice popup (app ConfirmModal): title, image, hint, one or two actions, outlined Cancel */
export default function ConfirmModal({
	visible,
	title,
	image,
	hint,
	error,
	confirmLabel,
	confirmColor,
	loading,
	onConfirm,
	secondaryLabel,
	secondaryColor,
	onSecondary,
	cancelLabel = "Cancel",
	onClose,
}: Props) {
	return (
		<AnimatedModal visible={visible} onClose={() => !loading && onClose()}>
			<p className={styles.modalTitle}>{title}</p>
			{image && <img className={styles.modalImage} src={image} alt="" />}
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
			{secondaryLabel && onSecondary && (
				<button
					className={`${styles.button} ${styles.muted} ${secondaryColor ? "bg-(--secondary)!" : ""}`}
					style={secondaryColor ? cssVars({ "--secondary": secondaryColor }) : undefined}
					onClick={onSecondary}
					disabled={loading}
				>
					{secondaryLabel}
				</button>
			)}
			{!loading && (
				<button className={`${styles.button} ${styles.cancelOutline}`} onClick={onClose}>
					{cancelLabel}
				</button>
			)}
		</AnimatedModal>
	);
}
