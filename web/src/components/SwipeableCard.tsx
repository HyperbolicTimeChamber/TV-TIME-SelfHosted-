import { HiCheck } from "react-icons/hi";
import {
	forwardRef,
	useCallback,
	useImperativeHandle,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { Spin } from "antd";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { RxCross2 } from "react-icons/rx";
import { colors } from "../theme/index";
import styles from "./styles/SwipeableCard.module.scss";
import { cssVars } from "../utils/cssVars";

export interface SwipeableCardRef {
	triggerSwipeLeft: () => void;
}

interface Props {
	children: ReactNode;
	/** Swipe RIGHT (card moves right) — "watched" action, named as in the app */
	/** Resolving `false` = nothing changed: the card slides back (app parity) */
	onSwipeLeft: () => Promise<boolean | void>;
	/** Swipe LEFT — stop / unwatch action; omit to turn that direction off */
	onSwipeRight?: () => Promise<boolean | void>;
	persistAfterSwipe?: boolean | { left: boolean; right: boolean };
	leftLabel?: string;
	rightLabel?: string;
	/** Text in the right reveal's circle instead of the ✕ icon — e.g. "−1" when unwatching drops a count */
	rightIcon?: string;
	leftColor?: string;
	rightColor?: string;
	/** The action done and the row staying: its banner flips over into the row (edge-on halfway,
	 *  where the banner goes) instead of the row coming back at once (app parity) */
	flipBack?: boolean;
}

type SwipeState = "idle" | "loading" | "done";
const THRESHOLD_RATIO = 0.35;
/** flipBack: banner → row flip (each half: turning edge-on, then flat) */
const FLIP_HALF_S = 0.26;

/** Swipe-to-act card (app SwipeableCard): drag past 35% to trigger, coloured reveal underneath */
export default forwardRef<SwipeableCardRef, Props>(function SwipeableCard(
	{
		children,
		onSwipeLeft,
		onSwipeRight,
		persistAfterSwipe = false,
		leftLabel = "Watched",
		rightLabel = "Stop",
		rightIcon,
		leftColor = colors.watchedGreen,
		rightColor = colors.stopBlue,
		flipBack = false,
	},
	ref,
) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const x = useMotionValue(0);
	const rotateX = useMotionValue(0);
	const [state, setState] = useState<SwipeState>("idle");
	const [action, setAction] = useState<"left" | "right" | null>(null);
	const processing = useRef(false);
	// One action per swipe: only the latest started swipe animation acts, once (an interrupted
	// animation's promise resolves too — that settle must not run the action a second time)
	const swipeSeq = useRef(0);
	const handledSeq = useRef(0);
	const startSwipe = (direction: "left" | "right", duration: number) => {
		const seq = ++swipeSeq.current;
		animate(x, direction === "left" ? width() : -width(), { duration }).then(() =>
			complete(direction, seq),
		);
	};
	const width = () => wrapperRef.current?.offsetWidth ?? 360;
	const leftOpacity = useTransform(x, (v) =>
		Math.min(1, Math.max(0, v / (width() * THRESHOLD_RATIO))),
	);
	const rightOpacity = useTransform(x, (v) =>
		Math.min(1, Math.max(0, -v / (width() * THRESHOLD_RATIO))),
	);

	const complete = useCallback(
		async (direction: "left" | "right", seq: number) => {
			if (seq !== swipeSeq.current || seq <= handledSeq.current || processing.current) return;
			handledSeq.current = seq;
			processing.current = true;
			setAction(direction);
			setState("loading");
			const persist =
				typeof persistAfterSwipe === "object" ? persistAfterSwipe[direction] : persistAfterSwipe;
			try {
				const result = await (direction === "left" ? onSwipeLeft() : onSwipeRight?.());
				if (result === false) {
					// Nothing changed (e.g. a rewatch's floor): back to the card, not hidden
					animate(x, 0, { duration: 0.3 });
					setState("idle");
				} else if (persist && flipBack) {
					// The banner turns edge-on, the row takes its place and turns flat
					// An unwatch (the right action) turns the other way round (app parity)
					const turn = direction === "left" ? 90 : -90;
					await animate(rotateX, turn, { duration: FLIP_HALF_S, ease: "easeIn" });
					x.set(0);
					rotateX.set(-turn);
					setState("idle");
					animate(rotateX, 0, { duration: FLIP_HALF_S, ease: "easeOut" });
				} else if (persist) {
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
		[onSwipeLeft, onSwipeRight, persistAfterSwipe, flipBack, x, rotateX],
	);

	useImperativeHandle(
		ref,
		() => ({
			triggerSwipeLeft: () => {
				if (state !== "idle" || processing.current) return;
				startSwipe("left", 0.3);
			},
		}),
		[state, complete, x],
	);

	if (state === "done") return null;

	const busyColor = action === "left" ? leftColor : rightColor;
	const busyLabel = action === "left" ? leftLabel : rightLabel;

	return (
		<motion.div
			className={styles.wrapper}
			ref={wrapperRef}
			style={{ rotateX, transformPerspective: 800 }}
		>
			{state === "loading" ? (
				<div className={`${styles.loading} bg-(--busy)!`} style={cssVars({ "--busy": busyColor })}>
					<Spin size="small" />
					<span className={styles.revealText}>{busyLabel}</span>
				</div>
			) : (
				<>
					<motion.div
						className={`${styles.reveal} ${styles.revealLeft} bg-(--reveal)!`}
						style={{ opacity: leftOpacity, ...cssVars({ "--reveal": leftColor }) }}
					>
						<span className={styles.revealIcon}>
							<HiCheck size={22} />
						</span>
						<span className={styles.revealText}>{leftLabel}</span>
					</motion.div>
					<motion.div
						className={`${styles.reveal} ${styles.revealRight} bg-(--reveal)!`}
						style={{ opacity: rightOpacity, ...cssVars({ "--reveal": rightColor }) }}
					>
						<span className={styles.revealText}>{rightLabel}</span>
						<span className={styles.revealIcon}>{rightIcon ?? <RxCross2 size={22} />}</span>
					</motion.div>
				</>
			)}
			<motion.div
				className={`${styles.card} ${state === "loading" ? "invisible" : ""}`}
				style={{ x }}
				drag={state === "idle" ? "x" : false}
				// No right action → the card only moves right
				dragConstraints={onSwipeRight ? undefined : { left: 0 }}
				dragElastic={onSwipeRight ? 0.5 : { left: 0, right: 0.5 }}
				dragDirectionLock
				dragSnapToOrigin={false}
				dragMomentum={false}
				onDragEnd={(_, info) => {
					const threshold = width() * THRESHOLD_RATIO;
					if (info.offset.x > threshold) startSwipe("left", 0.2);
					else if (onSwipeRight && info.offset.x < -threshold) startSwipe("right", 0.2);
					else animate(x, 0, { duration: 0.2 });
				}}
			>
				{children}
			</motion.div>
		</motion.div>
	);
});
