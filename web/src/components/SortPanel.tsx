import type { ReactNode } from "react";
import { Popover } from "antd";
import { IoCheckmark, IoOptionsOutline } from "react-icons/io5";
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
}

const strictEqual = <T,>(a: T, b: T) => a === b;

/** "Sort by" rows (checkmark on the active one) + optional extra sections — app SortSheet */
export function SortPanel<T>({
	options,
	selected,
	onSelect,
	isSame = strictEqual,
	children,
}: PanelProps<T>) {
	return (
		<div className={styles.panel}>
			<p className={styles.title}>Sort by</p>
			<div className={styles.group}>
				{options.map((option) => {
					const active = isSame(option.value, selected);
					return (
						<button
							key={option.label}
							className={`${styles.row} ${active ? styles.rowActive : ""}`}
							onClick={() => onSelect(option.value)}
						>
							{option.label}
							{active && <IoCheckmark size={18} />}
						</button>
					);
				})}
			</div>
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
}

/** Red circle (sliders icon) opening the sort popover — app SortFab */
export function SortButton({ open, onOpenChange, content, customised, label }: ButtonProps) {
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
				<IoOptionsOutline size={20} />
				{customised && <span className={styles.buttonDot} />}
			</button>
		</Popover>
	);
}
