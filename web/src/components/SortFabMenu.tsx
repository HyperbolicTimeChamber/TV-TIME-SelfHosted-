import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { IoClose } from "react-icons/io5";
import { SortIcon, SortLabel, type SortOption } from "./SortPanel";
import styles from "./styles/SortFabMenu.module.scss";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** Each pill appears this long after the one below it (nearest the button first) */
const STAGGER_S = 0.03;
const OPEN_S = 0.24;
const CLOSE_S = 0.16;
/** The button spins this far as its icon turns into ✕ (and back) */
const SPIN_DEG = 180;
/** Pills rise this far into place */
const RISE_PX = 12;

/** The picked pill's tick: a bold stroke, heavier than the icon set's checkmarks (app: BoldTick) */
const BOLD_TICK = (
	<svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
		<path
			d="M5 12.5l4.5 4.5L19 7.5"
			stroke="currentColor"
			strokeWidth={2.75}
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
);

interface Props<T> {
	options: readonly SortOption<T>[];
	selected: T;
	onSelect: (value: T) => void;
	isSame: (a: T, b: T) => boolean;
	/** Sort changed from the default — shows a dot on the closed button */
	customised: boolean;
	label: string;
}

/**
 * Floating red sort button that opens its options as a stack of pills above itself (the button
 * turns into ✕) — the picked one red with a tick, the rest the sort sheet's grey. Tap outside,
 * ✕ or Escape closes it. App: SortFabMenu
 */
export default function SortFabMenu<T>({
	options,
	selected,
	onSelect,
	isSame,
	customised,
	label,
}: Props<T>) {
	const [open, setOpen] = useState(false);
	const reduceMotion = useReducedMotion();

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	return (
		<>
			<AnimatePresence>
				{open && (
					<motion.div
						key="backdrop"
						className={styles.backdrop}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1, transition: { duration: reduceMotion ? 0 : OPEN_S } }}
						exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : CLOSE_S } }}
						onClick={() => setOpen(false)}
					/>
				)}
			</AnimatePresence>
			<div className={styles.anchor}>
				<AnimatePresence>
					{open && (
						<div className={styles.pills} key="pills">
							{options.map((option, i) => {
								const active = isSame(option.value, selected);
								// Nearest the button first
								const order = options.length - 1 - i;
								return (
									<motion.button
										key={option.label}
										type="button"
										className={`${styles.pill} ${active ? styles.pillActive : ""}`}
										aria-pressed={active}
										aria-label={option.label}
										initial={reduceMotion ? false : { opacity: 0, y: RISE_PX, scale: 0.9 }}
										animate={{
											opacity: 1,
											y: 0,
											scale: 1,
											transition: { duration: OPEN_S, ease: EASE_OUT, delay: order * STAGGER_S },
										}}
										exit={{
											opacity: 0,
											y: reduceMotion ? 0 : RISE_PX,
											scale: reduceMotion ? 1 : 0.9,
											transition: { duration: reduceMotion ? 0 : CLOSE_S, ease: EASE_OUT },
										}}
										onClick={() => {
											onSelect(option.value);
											setOpen(false);
										}}
									>
										{active && BOLD_TICK}
										<SortLabel label={option.label} />
									</motion.button>
								);
							})}
						</div>
					)}
				</AnimatePresence>
				<button
					type="button"
					className={styles.fab}
					onClick={() => setOpen((o) => !o)}
					aria-label={open ? "Close sort menu" : label}
					aria-expanded={open}
				>
					<motion.span
						className={styles.icon}
						animate={{ opacity: open ? 0 : 1, rotate: open ? SPIN_DEG : 0 }}
						transition={{ duration: reduceMotion ? 0 : OPEN_S, ease: EASE_OUT }}
					>
						<SortIcon size={26} />
					</motion.span>
					<motion.span
						className={styles.icon}
						initial={false}
						animate={{ opacity: open ? 1 : 0, rotate: open ? 0 : -SPIN_DEG }}
						transition={{ duration: reduceMotion ? 0 : OPEN_S, ease: EASE_OUT }}
					>
						<IoClose size={26} />
					</motion.span>
					{customised && !open && <span className={styles.dot} />}
				</button>
			</div>
		</>
	);
}
