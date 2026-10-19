import { motion } from "motion/react";

/**
 * Character art flush with the bottom of the viewport (app NotFoundArt): the cropped
 * legs read as climbing out of the screen. Height is --art-h (theme/global.scss);
 * reserve it under any content with pb-[calc(var(--art-h)+24px)].
 */
export default function NotFoundArt({
	src = "/not-found.png",
	inline = false,
}: {
	src?: string;
	/** In the layout flow (260px tall, e.g. above a message) instead of pinned to the viewport bottom */
	inline?: boolean;
}) {
	// Slides up from below the screen edge while fading in, no overshoot
	return (
		<motion.img
			src={src}
			alt=""
			aria-hidden
			className={
				inline
					? "pointer-events-none h-[260px] w-auto select-none"
					: "pointer-events-none fixed bottom-0 left-1/2 z-0 h-(--art-h) w-auto -translate-x-1/2 select-none"
			}
			initial={{ y: inline ? 40 : "100%", opacity: 0 }}
			animate={{ y: 0, opacity: 1 }}
			transition={{ duration: 0.35, ease: "easeOut", delay: 0.12 }}
		/>
	);
}
