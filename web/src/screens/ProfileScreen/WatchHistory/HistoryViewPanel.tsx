import { HistoryFilter, HistorySort } from "@app/enums";
import {
	HISTORY_FILTERS,
	HISTORY_FILTER_LABEL,
	HISTORY_SORT_LABEL,
	HISTORY_SORTS,
} from "@app/utils/historyView";
import { SortPanel, sortPanelTitleClass, type SortOption } from "../../../components/SortPanel";
import styles from "./styles/WatchHistory.module.scss";

const SORT_OPTIONS: SortOption<HistorySort>[] = HISTORY_SORTS.map((value) => ({
	value,
	label: HISTORY_SORT_LABEL[value],
}));

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
		<SortPanel options={SORT_OPTIONS} selected={sort} onSelect={onSort}>
			{!isMovie && (
				<>
					<div className={styles.viewFilterHead}>
						<p className={sortPanelTitleClass}>Filter</p>
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
		</SortPanel>
	);
}
