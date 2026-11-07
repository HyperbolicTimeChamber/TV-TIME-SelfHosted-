import { HiCheck } from "react-icons/hi";
import type { CSSProperties, ReactNode } from "react";
import { Popover } from "antd";
import { IoOptionsOutline } from "react-icons/io5";
import { FaLongArrowAltRight } from "react-icons/fa";
import Squircle from "./Squircle";
import styles from "./styles/SortPanel.module.scss";

export interface SortOption<T> {
	value: T;
	label: string;
}

interface PanelProps<T> {
	options: readonly SortOption<T>[];
	selected: T;
	onSelect: (value: T) => void;
	/** Option values that aren't primitives (e.g. { sort, direction }) */
	isSame?: (a: T, b: T) => boolean;
	/** Extra sections under the sort rows (e.g. Watch History's filters) */
	children?: ReactNode;
	/** Two or three options: one sliding segmented control instead of rows (app SegmentedControl) */
	segmented?: boolean;
}

const strictEqual = <T,>(a: T, b: T) => a === b;

/** An option's label — "A → Z" gets its arrow as an icon, centred on the letters (the text glyph
 *  sat low). The buttons carry the plain label as their accessible name */
export function SortLabel({ label }: { label: string }) {
	const parts = label.split(" → ");
	if (parts.length !== 2) return <>{label}</>;
	return (
		<span className={styles.arrowLabel}>
			{parts[0]}
			<FaLongArrowAltRight size={14} />
			{parts[1]}
		</span>
	);
}

/** Sort-only button icon: lines shortening downwards beside a down arrow (app: SortIcon) */
export function SortIcon({ size = 24 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
			<path
				d="M3 6h11M5.5 10h8.5M8 14h6M10.5 18H14M19 5v13M16 15l3 3 3-3"
				stroke="currentColor"
				strokeWidth={2}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** "Sort by" rows (checkmark on the active one) + optional extra sections — app SortSheet */
export function SortPanel<T>({
	options,
	selected,
	onSelect,
	isSame = strictEqual,
	children,
	segmented = false,
}: PanelProps<T>) {
	const activeIndex = Math.max(
		0,
		options.findIndex((o) => isSame(o.value, selected)),
	);
	return (
		<div className={styles.panel}>
			<p className={styles.title}>Sort by</p>
			{segmented ? (
				<div
					className={styles.segments}
					role="tablist"
					style={{ "--count": options.length, "--index": activeIndex } as CSSProperties}
				>
					{/* The pill slides to the pick — the eye follows the change */}
					<span className={styles.segmentPill} aria-hidden />
					{options.map((option, i) => (
						<button
							key={option.label}
							role="tab"
							aria-selected={i === activeIndex}
							className={`${styles.segment} ${i === activeIndex ? styles.segmentActive : ""}`}
							onClick={() => onSelect(option.value)}
						>
							{option.label}
						</button>
					))}
				</div>
			) : (
				<div className={styles.group}>
					{options.map((option) => {
						const active = isSame(option.value, selected);
						return (
							<button
								key={option.label}
								className={`${styles.row} ${active ? styles.rowActive : ""}`}
								aria-label={option.label}
								onClick={() => onSelect(option.value)}
							>
								<SortLabel label={option.label} />
								{active && <HiCheck size={18} />}
							</button>
						);
					})}
				</div>
			)}
			{children}
		</div>
	);
}

/** Section title matching "Sort by" — for extra panel sections */
export const sortPanelTitleClass = styles.title;

interface ButtonProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Usually a SortPanel */
	content: ReactNode;
	/** Sort (or filters) changed from the default — shows a dot */
	customised: boolean;
	label: string;
	/** Sort only: the sort icon; default the sliders (sort + filters) */
	sortOnly?: boolean;
}

/** Red squircle (sliders icon) opening the sort popover — app SortFab */
export function SortButton({
	open,
	onOpenChange,
	content,
	customised,
	label,
	sortOnly = false,
}: ButtonProps) {
	return (
		<Popover
			trigger="click"
			placement="bottomRight"
			open={open}
			onOpenChange={onOpenChange}
			arrow={false}
			content={content}
		>
			<button className={styles.button} aria-label={label}>
				<Squircle size={40} />
				{sortOnly ? <SortIcon size={22} /> : <IoOptionsOutline size={20} />}
				{customised && <span className={styles.buttonDot} />}
			</button>
		</Popover>
	);
}
