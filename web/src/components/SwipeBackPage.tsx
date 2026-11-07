import type { ReactNode } from "react";
import { motion } from "motion/react";

/** Swipe right farther than this to go back (as on the app) */
const SWIPE_BACK_PX = 60;

/**
 * Full-screen page that goes back on a right swipe (app SwipeBackView); vertical scroll stays
 * native. `disabled` while something on the page needs every touch (drag-to-reorder)
 */
export default function SwipeBackPage({
	onBack,
	disabled,
	className,
	children,
}: {
	onBack: () => void;
	disabled?: boolean;
	className?: string;
	children: ReactNode;
}) {
	return (
		<motion.div
			drag={disabled ? false : "x"}
			dragDirectionLock
			dragConstraints={{ left: 0, right: 0 }}
			dragElastic={0.2}
			className={`${className ?? ""} touch-pan-y`}
			onDragEnd={(_, info) => {
				if (info.offset.x > SWIPE_BACK_PX) onBack();
			}}
		>
			{children}
		</motion.div>
	);
}
