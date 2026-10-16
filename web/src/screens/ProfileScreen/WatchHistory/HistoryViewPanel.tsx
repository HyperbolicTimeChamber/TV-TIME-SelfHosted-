import { IoCheckmark } from "react-icons/io5";
import { HistoryFilter, HistorySort } from "@app/enums";
import {
	HISTORY_FILTERS,
	HISTORY_FILTER_LABEL,
	HISTORY_SORT_LABEL,
	HISTORY_SORTS,
} from "@app/utils/historyView";
import styles from "./styles/WatchHistory.module.scss";

interface Props {
	isMovie: boolean;
	sort: HistorySort;
	onSort: (sort: HistorySort) => void;
	filters: ReadonlySet<HistoryFilter>;
	onToggleFilter: (filter: HistoryFilter) => void;
	onClearFilters: () => void;
}

/** Sort order (saved) + status filters (TV only, cleared on leaving) — app HistoryViewSheet */
export default function HistoryViewPanel({ isMovie, sort, onSort, filters, onToggleFilter, onClearFilters }: Props) {
	return (
		<div className={styles.viewPanel}>
			<p className={styles.viewTitle}>Sort by</p>
			{HISTORY_SORTS.map((option) => (
				<button
					key={option}
					className={`${styles.viewRow} ${option === sort ? styles.viewRowActive : ""}`}
					onClick={() => onSort(option)}
				>
					{HISTORY_SORT_LABEL[option]}
					{option === sort && <IoCheckmark className="text-primary" size={18} />}
				</button>
			))}
			{!isMovie && (
				<>
					<div className={styles.viewFilterHead}>
						<p className={styles.viewTitle}>Filter</p>
						{filters.size > 0 && (
							<button className={styles.viewClear} onClick={onClearFilters}>
								Clear
							</button>
						)}
					</div>
					<div className={styles.viewChips}>
						{HISTORY_FILTERS.map((f) => (
							<button
								key={f}
								className={`${styles.viewChip} ${filters.has(f) ? styles.viewChipOn : ""}`}
								aria-pressed={filters.has(f)}
								onClick={() => onToggleFilter(f)}
							>
								{HISTORY_FILTER_LABEL[f]}
							</button>
						))}
					</div>
				</>
			)}
		</div>
	);
}
