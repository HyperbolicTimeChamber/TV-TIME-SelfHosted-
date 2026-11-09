import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import styles from "./styles/AddToListSheet.module.scss";

export interface SheetOption {
	key: string;
	label: string;
	icon: ReactNode;
	destructive?: boolean;
	onClick: () => void;
}

interface Props {
	visible: boolean;
	title: string;
	subtitle?: string;
	options: SheetOption[];
	onClose: () => void;
}

/** A bottom sheet of actions — the long-press menu (app OptionsSheet); drag the header down to close */
export default function OptionsSheet({ visible, title, subtitle, options, onClose }: Props) {
	const dragControls = useDragControls();
	return createPortal(
		<AnimatePresence>
			{visible && (
				<motion.div
					className={styles.overlay}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					onClick={onClose}
				>
					<motion.div
						className={styles.sheet}
						role="dialog"
						aria-label={title}
						initial={{ y: "100%" }}
						animate={{ y: 0, transition: { type: "spring", damping: 20, stiffness: 200 } }}
						exit={{ y: "100%", transition: { duration: 0.2 } }}
						drag="y"
						dragListener={false}
						dragControls={dragControls}
						dragConstraints={{ top: 0, bottom: 0 }}
						dragElastic={{ top: 0, bottom: 1 }}
						onDragEnd={(_, info) => {
							if (info.offset.y > 80 || info.velocity.y > 500) onClose();
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<div className={styles.dragHeader} onPointerDown={(e) => dragControls.start(e)}>
							<div className={styles.handle} />
							<p className={styles.title}>{title}</p>
							<p className={`${styles.subtitle} ${styles.optionTruncate}`}>{subtitle ?? ""}</p>
						</div>
						{options.map((o) => (
							<button
								key={o.key}
								className={styles.option}
								onClick={() => {
									onClose();
									o.onClick();
								}}
							>
								<span className={styles.optionIcon}>{o.icon}</span>
								<span className={o.destructive ? styles.optionTextDanger : styles.optionText}>
									{o.label}
								</span>
							</button>
						))}
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body,
	);
}
