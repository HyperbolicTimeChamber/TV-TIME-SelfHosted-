import { motion } from "motion/react";

/**
 * Character art flush with the bottom of the viewport (app NotFoundArt): the cropped
 * legs read as climbing out of the screen. Height is --art-h (theme/global.scss);
 * reserve it under any content with pb-[calc(var(--art-h)+24px)].
 */
export default function NotFoundArt({ src = "/not-found.png" }: { src?: string }) {
	// Slides up from below the screen edge, no overshoot
	return (
		<motion.img
			src={src}
			alt=""
			aria-hidden
			className="pointer-events-none fixed bottom-0 left-1/2 z-0 h-(--art-h) w-auto max-w-none -translate-x-1/2 select-none"
			initial={{ y: "100%" }}
			animate={{ y: 0 }}
			transition={{ duration: 0.35, ease: "easeOut", delay: 0.12 }}
		/>
	);
}
