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
	/** Scroll right instead of left */
	reverse?: boolean;
	/** Where in the loop the row starts, 0–1 — staggers stacked rows */
	offset?: number;
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
	reverse = false,
	offset = 0,
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
	const loop = items.length * secondsPerItem;
	return (
		<div className={`${className} ${styles.viewport}`}>
			<div
				className={`${styles.track} ${reverse ? styles.reverse : ""}`}
				// Negative delay = start part-way through the loop
				style={cssVars({ "--loop": `${loop}s`, "--start": `${-offset * loop}s` })}
			>
				{copy(false)}
				{copy(true)}
			</div>
		</div>
	);
}
