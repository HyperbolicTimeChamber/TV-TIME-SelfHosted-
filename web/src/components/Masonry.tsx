import type { ReactNode } from "react";

interface Props<T> {
	items: T[];
	columns: number;
	getKey: (item: T) => string;
	renderItem: (item: T) => ReactNode;
	className?: string;
	columnClassName?: string;
}

/**
 * Unsplash-style masonry: independent columns, so a taller item never leaves a gap
 * beside it. Items fill columns left → right (item i → column i % n), keeping reading
 * order across rows — unlike CSS `columns`, which fills top → bottom first.
 */
export default function Masonry<T>({ items, columns, getKey, renderItem, className = "", columnClassName = "" }: Props<T>) {
	const cols: T[][] = Array.from({ length: columns }, () => []);
	items.forEach((item, i) => cols[i % columns].push(item));
	return (
		<div className={`flex items-start ${className}`}>
			{cols.map((col, c) => (
				<div key={c} className={`flex min-w-0 flex-1 flex-col ${columnClassName}`}>
					{col.map((item) => (
						<div key={getKey(item)}>{renderItem(item)}</div>
					))}
				</div>
			))}
		</div>
	);
}
