import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import SortSheet, { sortSheetStyles, type SortOption } from "../../../components/SortSheet";
import { HistoryFilter, HistorySort } from "../../../enums";
import {
	HISTORY_FILTERS,
	HISTORY_FILTER_LABEL,
	HISTORY_SORT_LABEL,
	HISTORY_SORTS,
} from "../../../utils/historyView";
import { colors } from "../../../theme";
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
		<SortSheet
			visible={visible}
			onClose={onClose}
			options={SORT_OPTIONS}
			selected={sort}
			onSelect={onSort}
		>
			{!isMovie && (
				<>
					<View style={styles.sheetFilterHead}>
						<Text style={[sortSheetStyles.title, styles.sheetFilterTitle]}>FILTER</Text>
						{filters.size > 0 && (
							<Pressable
								onPress={onClearFilters}
								hitSlop={8}
								accessibilityRole="button"
								style={({ pressed }) => [styles.sheetClear, pressed && styles.chipPressed]}
							>
								<Text style={styles.sheetClearText}>Clear</Text>
							</Pressable>
						)}
					</View>
					<View style={styles.chipWrap}>
						{HISTORY_FILTERS.map((f) => {
							const on = filters.has(f);
							return (
								<Pressable
									key={f}
									style={({ pressed }) => [
										styles.filterChip,
										on && styles.filterChipOn,
										pressed && styles.chipPressed,
									]}
									onPress={() => onToggleFilter(f)}
									accessibilityRole="button"
									accessibilityState={{ selected: on }}
								>
									{on && <Ionicons name="checkmark" size={16} color={colors.text} />}
									<Text style={[styles.filterChipText, on && styles.filterChipTextOn]}>
										{HISTORY_FILTER_LABEL[f]}
									</Text>
								</Pressable>
							);
						})}
					</View>
				</>
			)}
		</SortSheet>
	);
}
