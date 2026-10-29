import {
	Children,
	Fragment,
	cloneElement,
	isValidElement,
	useEffect,
	useState,
	type ReactElement,
	type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import type { IconType } from "react-icons";
import { tmdbLogoUri } from "@app/hooks/useTmdbImage";
import { useTitleLogo } from "@app/hooks/useTitleLogo";
import type { MediaType } from "@app/enums";
import styles from "./styles/BottomSheet.module.scss";
import { cssVars } from "../utils/cssVars";

/** Slide-in: critically damped (damping ≥ 2·√stiffness), never past its resting place — an
 *  overshoot lifted the sheet off the bottom edge and showed the page under it (app SHEET_SPRING) */
const SHEET_SPRING = { type: "spring", damping: 32, stiffness: 220 } as const;
/** Exit: faster than the entry, iOS drawer curve */
const SHEET_EXIT = { duration: 0.22, ease: [0.32, 0.72, 0, 1] } as const;

/** Bottom sheet with drag-down-to-dismiss (app BottomSheet) */
export default function BottomSheet({
	visible,
	label,
	onClose,
	children,
}: {
	visible: boolean;
	/** Dialog's accessible name */
	label: string;
	onClose: () => void;
	children: ReactNode;
}) {
	return createPortal(
		<AnimatePresence>
			{visible && (
				// Backdrop and sheet are siblings: the backdrop fades, the sheet only slides (as a
				// child of the fading backdrop it faded out too and read as a blink)
				// motion.div (no animation of its own) so AnimatePresence waits for both exits
				<motion.div key="sheet" className={styles.overlay}>
					<motion.div
						className={styles.backdrop}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0, transition: SHEET_EXIT }}
						onClick={onClose}
					/>
					<motion.div
						className={styles.sheet}
						role="dialog"
						aria-label={label}
						initial={{ y: "100%" }}
						animate={{ y: 0, transition: SHEET_SPRING }}
						exit={{ y: "100%", transition: SHEET_EXIT }}
						drag="y"
						dragConstraints={{ top: 0, bottom: 0 }}
						dragElastic={{ top: 0.05, bottom: 1 }}
						onDragEnd={(_, info) => {
							if (info.offset.y > 80 || info.velocity.y > 500) onClose();
						}}
					>
						<div className={styles.handle} />
						{children}
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body,
	);
}

/** Wait this long for the logo before falling back to the name — the name flashing in and
 *  then swapping for the logo read as a glitch (app NAME_DELAY_MS) */
const NAME_DELAY_MS = 2000;

/** Calendar-style square: a small label over a rule over a big value — the right side of a
 *  sheet header, as tall as the logo + line beside it (app HeaderSquare) */
function HeaderSquare({
	label,
	value,
	suffix,
	ariaLabel,
}: {
	label: string;
	value: string;
	/** Smaller trailing unit (e.g. the X of 2X) so the number reads first */
	suffix?: string;
	ariaLabel: string;
}) {
	return (
		<span className={styles.epSquare} aria-label={ariaLabel}>
			<span className={styles.epSquareTitle}>{label}</span>
			<span className={styles.epSquareRule} />
			<span className={styles.epSquareValue}>
				{value}
				{suffix && <span className={styles.epSquareSuffix}>{suffix}</span>}
			</span>
		</span>
	);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** SEASON xx over a big Exx (watchlist episode sheet) */
export function EpisodeSquare({ season, episode }: { season: number; episode: number }) {
	return (
		<HeaderSquare
			label={`SEASON ${pad2(season)}`}
			value={`E${pad2(episode)}`}
			ariaLabel={`Season ${season}, episode ${episode}`}
		/>
	);
}

/** WATCHED over a big nX (info page season / episode sheet) */
export function WatchCountSquare({ count }: { count: number }) {
	return (
		<HeaderSquare
			label="WATCHED"
			value={String(count)}
			suffix="X"
			ariaLabel={`Watched ${count} ${count === 1 ? "time" : "times"}`}
		/>
	);
}

/**
 * Logo (name fallback) + what the sheet is about on the left; on the right an optional `aside`
 * (EpisodeSquare / WatchCountSquare). `centered`: the logo alone, centred.
 * The logo sits in a fixed-height slot so the sheet never resizes while it loads (app SheetHeader)
 */
export function SheetHeader({
	title,
	subtitle,
	tmdbId,
	mediaType,
	logoPath: givenLogo,
	aside,
	centered = false,
}: {
	title: string;
	subtitle?: string;
	tmdbId?: number;
	mediaType?: MediaType;
	logoPath?: string | null;
	aside?: ReactNode;
	centered?: boolean;
}) {
	const logoPath = useTitleLogo(givenLogo, tmdbId, mediaType);
	const [loaded, setLoaded] = useState(false);
	const [failed, setFailed] = useState(false);
	const [waited, setWaited] = useState(false);
	useEffect(() => {
		const t = window.setTimeout(() => setWaited(true), NAME_DELAY_MS);
		return () => window.clearTimeout(t);
	}, []);
	const showLogo = !!logoPath && !failed;
	// Known to have no logo (or it failed): the name at once; still loading: after the delay
	const showName = logoPath === null || failed || (!loaded && waited);
	const right = aside ?? null;
	return (
		// With an aside the row stretches: the square takes the logo + name column's height
		<div className={`${styles.header} ${aside ? styles.headerStretch : ""}`}>
			{/* Logo + line: fixed height (no resize while the logo loads), the block centred in it
			    and the logo box fitted to the logo — lines up with the square's middle */}
			<div
				className={`${styles.headerText} ${centered ? styles.centered : ""} ${subtitle && !centered ? styles.headerTextFixed : ""}`}
			>
				<div className={`${styles.logoSlot} ${subtitle && !centered ? styles.logoSlotFit : ""}`}>
					{showName && <span className={styles.name}>{title}</span>}
					{showLogo && (
						<img
							className={`${styles.logo} ${loaded ? "" : styles.logoLoading}`}
							src={tmdbLogoUri(logoPath, 360)}
							alt={title}
							onLoad={() => setLoaded(true)}
							onError={() => setFailed(true)}
						/>
					)}
				</div>
				{subtitle && <span className={styles.subtitle}>{subtitle}</span>}
			</div>
			{!centered && right}
		</div>
	);
}

/** Rows grouped in one rounded card, hairlines between them */
export function SheetGroup({ children }: { children: ReactNode }) {
	const rows = Children.toArray(children).filter(Boolean);
	return (
		<div className={styles.group}>
			{rows.map((row, i) => {
				// A collapsing row carries its own hairline, so the line folds away with it
				if (isValidElement(row) && row.type === SheetCollapse) {
					return cloneElement(row as ReactElement<SheetCollapseProps>, {
						key: i,
						separator: i > 0,
					});
				}
				return (
					<Fragment key={i}>
						{i > 0 && <div className={styles.separator} />}
						{row}
					</Fragment>
				);
			})}
		</div>
	);
}

/** Row folding in / out: a morph on screen → ease-in-out (an ease-out front-loads ~80% of the
 *  travel into the first frames and read as a snap) — app COLLAPSE */
const COLLAPSE = { duration: 0.28, ease: [0.65, 0, 0.35, 1] } as const;

interface SheetCollapseProps {
	open: boolean;
	children: ReactNode;
	/** Set by SheetGroup: draw the row's top hairline inside the collapsing part */
	separator?: boolean;
}

/** A SheetGroup row that comes and goes: height + fade instead of snapping (app SheetCollapse) */
export function SheetCollapse({ open, children, separator = false }: SheetCollapseProps) {
	return (
		<AnimatePresence initial={false}>
			{open && (
				<motion.div
					className={styles.collapse}
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1, transition: COLLAPSE }}
					exit={{ height: 0, opacity: 0, transition: COLLAPSE }}
				>
					{separator && <div className={styles.separator} />}
					{children}
				</motion.div>
			)}
		</AnimatePresence>
	);
}

export function SheetIcon({ icon: Icon, color }: { icon: IconType; color: string }) {
	return (
		<span className={styles.iconTile} style={cssVars({ "--tint": color })}>
			<Icon size={20} />
		</span>
	);
}

/** Icon tile (tinted), title + hint; scales a touch on press */
export function SheetOption({
	icon,
	color,
	title,
	hint,
	destructive = false,
	onClick,
}: {
	icon: IconType;
	color: string;
	title: string;
	hint?: string;
	destructive?: boolean;
	onClick: () => void;
}) {
	return (
		<button type="button" className={`${styles.row} ${styles.option}`} onClick={onClick}>
			<SheetIcon icon={icon} color={color} />
			<span className={styles.rowContent}>
				<span className={destructive ? styles.rowTextDanger : styles.rowText}>{title}</span>
				{hint && <span className={styles.rowHint}>{hint}</span>}
			</span>
		</button>
	);
}

export { styles as sheetStyles };
