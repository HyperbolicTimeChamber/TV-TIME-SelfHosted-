import { Fragment, type ReactNode } from "react";
import { cssVars } from "../utils/cssVars";
import styles from "./styles/Marquee.module.scss";

interface Props<T> {
	items: T[];
	getKey: (item: T) => string | number;
	/** `hidden` = the looping duplicate: keep it out of tab order / screen readers */
	renderItem: (item: T, hidden: boolean) => ReactNode;
	/** Scroll only when there are more items than this; otherwise a plain row */
	threshold?: number;
	/** Constant speed: each item adds this many seconds to one loop */
	secondsPerItem?: number;
	/** Row styling (gap, padding, overflow) — shared by the static and moving versions */
	className?: string;
}

/**
 * Continuously scrolling row (infinite loop): the items render twice and slide left by
 * one copy's width, so the seam is invisible. Pauses on hover / focus; reduced-motion
 * users get the plain scrollable row.
 */
export default function Marquee<T>({
	items,
	getKey,
	renderItem,
	threshold = 6,
	secondsPerItem = 4,
	className = "",
}: Props<T>) {
	if (items.length <= threshold) {
		return (
			<div className={className}>
				{items.map((item) => (
					<Fragment key={getKey(item)}>{renderItem(item, false)}</Fragment>
				))}
			</div>
		);
	}
	const copy = (hidden: boolean) => (
		<div className={styles.group} aria-hidden={hidden || undefined} inert={hidden || undefined}>
			{items.map((item) => (
				<Fragment key={getKey(item)}>{renderItem(item, hidden)}</Fragment>
			))}
		</div>
	);
	return (
		<div className={`${className} ${styles.viewport}`}>
			<div className={styles.track} style={cssVars({ "--loop": `${items.length * secondsPerItem}s` })}>
				{copy(false)}
				{copy(true)}
			</div>
		</div>
	);
}
