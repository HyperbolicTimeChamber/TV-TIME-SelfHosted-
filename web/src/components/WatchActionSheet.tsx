import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import type { WatchAction } from "@app/types";
import styles from "./styles/WatchActionSheet.module.scss";

interface Props {
	visible: boolean;
	label: string;
	watchCount: number;
	onSelect: (action: WatchAction) => void;
	onClose: () => void;
}

const OPTIONS: Array<{
	action: WatchAction;
	icon: string;
	text: string;
	hint: string;
	danger?: boolean;
}> = [
	{ action: "rewatch", icon: "🔄", text: "Rewatch", hint: "Mark as watched again" },
	{
		action: "watched_once_less",
		icon: "−1",
		text: "Watched Once Less",
		hint: "Reduce watch count by 1",
	},
	{
		action: "not_watched",
		icon: "✕",
		text: "Not Watched",
		hint: "Remove all watch history",
		danger: true,
	},
];

/** Bottom sheet with drag-down-to-dismiss (app WatchActionSheet) */
export default function WatchActionSheet({ visible, label, watchCount, onSelect, onClose }: Props) {
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
						aria-label={label}
						initial={{ y: "100%" }}
						animate={{ y: 0, transition: { type: "spring", damping: 20, stiffness: 200 } }}
						exit={{ y: "100%", transition: { duration: 0.2 } }}
						drag="y"
						dragConstraints={{ top: 0, bottom: 0 }}
						dragElastic={{ top: 0, bottom: 1 }}
						onDragEnd={(_, info) => {
							if (info.offset.y > 80 || info.velocity.y > 500) onClose();
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<div className={styles.handle} />
						<p className={styles.title}>{label}</p>
						<p className={styles.subtitle}>Watched {watchCount}x</p>
						{OPTIONS.map((o) => (
							<button
								key={o.action}
								className={styles.option}
								onClick={() => {
									onClose();
									onSelect(o.action);
								}}
							>
								<span className={styles.optionIcon}>{o.icon}</span>
								<span className={styles.optionContent}>
									<span className={o.danger ? styles.optionTextDanger : styles.optionText}>
										{o.text}
									</span>
									<span className={styles.optionHint}>{o.hint}</span>
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
