import { Children, Fragment, useState, type ReactNode } from "react";
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
				<motion.div
					className={styles.overlay}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0, transition: SHEET_EXIT }}
					onClick={onClose}
				>
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
						onClick={(e) => e.stopPropagation()}
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

/** Logo (name fallback) + what the sheet is about on the left, watch count pill on the right.
 *  No `watchCount` → just the logo, centred (the sheet shows the count itself) */
export function SheetHeader({
	title,
	subtitle,
	tmdbId,
	mediaType,
	logoPath: givenLogo,
	watchCount,
}: {
	title: string;
	subtitle?: string;
	tmdbId?: number;
	mediaType?: MediaType;
	logoPath?: string | null;
	watchCount?: number;
}) {
	const centered = watchCount === undefined;
	const logoPath = useTitleLogo(givenLogo, tmdbId, mediaType);
	const [loaded, setLoaded] = useState(false);
	const [failed, setFailed] = useState(false);
	const showLogo = !!logoPath && !failed;
	return (
		<div className={styles.header}>
			<div className={`${styles.headerText} ${centered ? styles.centered : ""}`}>
				<div className={styles.logoSlot}>
					{(!showLogo || !loaded) && <span className={styles.name}>{title}</span>}
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
			{!centered && <WatchCountPill count={watchCount} className={styles.headerPill} />}
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
