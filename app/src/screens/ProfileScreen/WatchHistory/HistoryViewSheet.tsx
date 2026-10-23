import { Text, TouchableOpacity, View } from "react-native";
import SortSheet, { sortSheetStyles, type SortOption } from "../../../components/SortSheet";
import { HistoryFilter, HistorySort } from "../../../enums";
import {
	HISTORY_FILTERS,
	HISTORY_FILTER_LABEL,
	HISTORY_SORT_LABEL,
	HISTORY_SORTS,
} from "../../../utils/historyView";
import { styles } from "./styles";

const SORT_OPTIONS: SortOption<HistorySort>[] = HISTORY_SORTS.map((value) => ({
	value,
	label: HISTORY_SORT_LABEL[value],
}));

interface Props {
	visible: boolean;
	onClose: () => void;
	isMovie: boolean;
	sort: HistorySort;
	onSort: (sort: HistorySort) => void;
	filters: ReadonlySet<HistoryFilter>;
	onToggleFilter: (filter: HistoryFilter) => void;
	onClearFilters: () => void;
}

/** Bottom sheet: sort order (saved) + status filters (TV only, cleared on leaving) */
export default function HistoryViewSheet({
	visible,
	onClose,
	isMovie,
	sort,
	onSort,
	filters,
	onToggleFilter,
	onClearFilters,
}: Props) {
	return (
		<SortSheet visible={visible} onClose={onClose} options={SORT_OPTIONS} selected={sort} onSelect={onSort}>
			{!isMovie && (
				<>
					<View style={styles.sheetFilterHead}>
						<Text style={sortSheetStyles.title}>Filter</Text>
						{filters.size > 0 && (
							<TouchableOpacity onPress={onClearFilters}>
								<Text style={styles.sheetClear}>Clear</Text>
							</TouchableOpacity>
						)}
					</View>
					<View style={styles.chipWrap}>
						{HISTORY_FILTERS.map((f) => {
							const on = filters.has(f);
							return (
								<TouchableOpacity
									key={f}
									style={[styles.filterChip, on && styles.filterChipOn]}
									onPress={() => onToggleFilter(f)}
								>
									<Text style={[styles.filterChipText, on && styles.filterChipTextOn]}>
										{HISTORY_FILTER_LABEL[f]}
									</Text>
								</TouchableOpacity>
							);
						})}
					</View>
				</>
			)}
		</SortSheet>
	);
}
