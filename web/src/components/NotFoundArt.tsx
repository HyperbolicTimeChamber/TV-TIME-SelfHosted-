import { motion } from "motion/react";

/**
 * Character art flush with the bottom of the viewport (app NotFoundArt): the cropped
 * legs read as climbing out of the screen. Height is --art-h (theme/global.scss);
 * reserve it under any content with pb-[calc(var(--art-h)+16px)].
 */
export default function NotFoundArt() {
	return (
		<motion.img
			src="/not-found.png"
			alt=""
			aria-hidden
			className="pointer-events-none fixed bottom-0 left-1/2 z-0 h-(--art-h) w-auto -translate-x-1/2 select-none"
			initial={{ y: "100%" }}
			animate={{ y: 0 }}
			transition={{ type: "spring", damping: 11, stiffness: 90, delay: 0.12 }}
		/>
	);
}
