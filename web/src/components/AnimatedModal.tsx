import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import styles from "./styles/ui.module.scss";
import { cssVars, px } from "../utils/cssVars";

interface Props {
	visible: boolean;
	onClose: () => void;
	children: ReactNode;
	/** Card width (mobile app uses 80% of screen) */
	width?: number | string;
}

/** Centered card modal — fade backdrop + spring scale, like the app's AnimatedModal */
export default function AnimatedModal({ visible, onClose, children, width }: Props) {
	useEffect(() => {
		if (!visible) return;
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [visible, onClose]);

	return createPortal(
		<AnimatePresence>
			{visible && (
				<motion.div
					className={styles.backdrop}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0, transition: { duration: 0.18 } }}
					onClick={onClose}
				>
					<motion.div
						role="dialog"
						aria-modal="true"
						className={`${styles.modalCard} ${width ? "w-(--modal-w)!" : ""}`}
						style={width ? cssVars({ "--modal-w": typeof width === "number" ? px(width) : width }) : undefined}
						initial={{ scale: 0.85, opacity: 0 }}
						animate={{ scale: 1, opacity: 1, transition: { type: "spring", stiffness: 300, damping: 22 } }}
						exit={{ scale: 0.85, opacity: 0, transition: { duration: 0.18 } }}
						onClick={(e) => e.stopPropagation()}
					>
						{children}
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body,
	);
}
