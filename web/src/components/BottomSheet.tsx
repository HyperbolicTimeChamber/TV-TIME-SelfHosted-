import { Children, Fragment, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import type { IconType } from "react-icons";
import { tmdbLogoUri } from "@app/hooks/useTmdbImage";
import { useTitleLogo } from "@app/hooks/useTitleLogo";
import type { MediaType } from "@app/enums";
import WatchCountPill from "./WatchCountPill";
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

/** Calendar-style square: SEASON xx over a big Exx (watchlist episode sheet) */
export function EpisodeSquare({ season, episode }: { season: number; episode: number }) {
	const pad = (n: number) => String(n).padStart(2, "0");
	return (
		<span className={styles.epSquare} aria-label={`Season ${season}, episode ${episode}`}>
			<span className={styles.epSquareTitle}>SEASON {pad(season)}</span>
			<span className={styles.epSquareRule} />
			<span className={styles.epSquareValue}>E{pad(episode)}</span>
		</span>
	);
}

/**
 * Logo (name fallback) + what the sheet is about on the left; on the right the watch count
 * pill (`watchCount`) or any `aside` (e.g. EpisodeSquare). `centered`: the logo alone, centred.
 * The logo sits in a fixed-height slot so the sheet never resizes while it loads (app SheetHeader)
 */
export function SheetHeader({
	title,
	subtitle,
	tmdbId,
	mediaType,
	logoPath: givenLogo,
	watchCount,
	aside,
	centered = false,
}: {
	title: string;
	subtitle?: string;
	tmdbId?: number;
	mediaType?: MediaType;
	logoPath?: string | null;
	watchCount?: number;
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
	const right =
		aside ??
		(watchCount !== undefined ? (
			<WatchCountPill count={watchCount} className={styles.headerPill} />
		) : null);
	return (
		<div className={styles.header}>
			<div className={`${styles.headerText} ${centered ? styles.centered : ""}`}>
				<div className={styles.logoSlot}>
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
			{rows.map((row, i) => (
				<Fragment key={i}>
					{i > 0 && <div className={styles.separator} />}
					{row}
				</Fragment>
			))}
		</div>
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
