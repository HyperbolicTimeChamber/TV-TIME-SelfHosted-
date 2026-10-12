import { forwardRef, useCallback, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { Spin } from "antd";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { colors } from "../theme/index";
import styles from "./styles/SwipeableCard.module.scss";
import { cssVars } from "../utils/cssVars";

export interface SwipeableCardRef {
	triggerSwipeLeft: () => void;
}

interface Props {
	children: ReactNode;
	/** Swipe RIGHT (card moves right) — "watched" action, named as in the app */
	onSwipeLeft: () => Promise<void>;
	/** Swipe LEFT — stop / unwatch action */
	onSwipeRight: () => Promise<void>;
	persistAfterSwipe?: boolean | { left: boolean; right: boolean };
	leftLabel?: string;
	rightLabel?: string;
	leftColor?: string;
	rightColor?: string;
}

type SwipeState = "idle" | "loading" | "done";
const THRESHOLD_RATIO = 0.35;

/** Swipe-to-act card (app SwipeableCard): drag past 35% to trigger, coloured reveal underneath */
export default forwardRef<SwipeableCardRef, Props>(function SwipeableCard(
	{
		children,
		onSwipeLeft,
		onSwipeRight,
		persistAfterSwipe = false,
		leftLabel = "Watched",
		rightLabel = "Stop",
		leftColor = colors.watchedGreen,
		rightColor = colors.stopBlue,
	},
	ref,
) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const x = useMotionValue(0);
	const [state, setState] = useState<SwipeState>("idle");
	const [action, setAction] = useState<"left" | "right" | null>(null);
	const processing = useRef(false);
	const width = () => wrapperRef.current?.offsetWidth ?? 360;
	const leftOpacity = useTransform(x, (v) => Math.min(1, Math.max(0, v / (width() * THRESHOLD_RATIO))));
	const rightOpacity = useTransform(x, (v) => Math.min(1, Math.max(0, -v / (width() * THRESHOLD_RATIO))));

	const complete = useCallback(
		async (direction: "left" | "right") => {
			if (processing.current) return;
			processing.current = true;
			setAction(direction);
			setState("loading");
			const persist = typeof persistAfterSwipe === "object" ? persistAfterSwipe[direction] : persistAfterSwipe;
			try {
				await (direction === "left" ? onSwipeLeft() : onSwipeRight());
				if (persist) {
					// List re-render replaces the card; reset quietly
					x.set(0);
					setState("idle");
				} else {
					setState("done");
				}
			} catch (err) {
				console.error("SwipeableCard action failed:", err);
				animate(x, 0, { duration: 0.3 });
				setState("idle");
			} finally {
				setAction(null);
				processing.current = false;
			}
		},
		[onSwipeLeft, onSwipeRight, persistAfterSwipe, x],
	);

	useImperativeHandle(
		ref,
		() => ({
			triggerSwipeLeft: () => {
				if (state !== "idle" || processing.current) return;
				animate(x, width(), { duration: 0.3 }).then(() => complete("left"));
			},
		}),
		[state, complete, x],
	);

	if (state === "done") return null;

	const busyColor = action === "left" ? leftColor : rightColor;
	const busyLabel = action === "left" ? leftLabel : rightLabel;

	return (
		<div className={styles.wrapper} ref={wrapperRef}>
			{state === "loading" ? (
				<div className={`${styles.loading} bg-(--busy)!`} style={cssVars({ "--busy": busyColor })}>
					<Spin size="small" />
					<span className={styles.revealText}>{busyLabel}</span>
				</div>
			) : (
				<>
					<motion.div className={`${styles.reveal} ${styles.revealLeft} bg-(--reveal)!`} style={{ opacity: leftOpacity, ...cssVars({ "--reveal": leftColor }) }}>
						<span className={styles.revealIcon}>✓</span>
						<span className={styles.revealText}>{leftLabel}</span>
					</motion.div>
					<motion.div className={`${styles.reveal} ${styles.revealRight} bg-(--reveal)!`} style={{ opacity: rightOpacity, ...cssVars({ "--reveal": rightColor }) }}>
						<span className={styles.revealText}>{rightLabel}</span>
						<span className={styles.revealIcon}>✕</span>
					</motion.div>
				</>
			)}
			<motion.div
				className={`${styles.card} ${state === "loading" ? "invisible" : ""}`}
				style={{ x }}
				drag={state === "idle" ? "x" : false}
				dragDirectionLock
				dragSnapToOrigin={false}
				dragMomentum={false}
				onDragEnd={(_, info) => {
					const threshold = width() * THRESHOLD_RATIO;
					if (info.offset.x > threshold) animate(x, width(), { duration: 0.2 }).then(() => complete("left"));
					else if (info.offset.x < -threshold) animate(x, -width(), { duration: 0.2 }).then(() => complete("right"));
					else animate(x, 0, { duration: 0.2 });
				}}
			>
				{children}
			</motion.div>
		</div>
	);
});
