import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HistoryFilter, HistorySort } from "../../../enums";
import {
	HISTORY_FILTERS,
	HISTORY_FILTER_LABEL,
	HISTORY_SORT_LABEL,
	HISTORY_SORTS,
} from "../../../utils/historyView";
import { colors } from "../../../theme";
import { styles } from "./styles";

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
	const { bottom } = useSafeAreaInsets();
	return (
		<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
			<Pressable style={styles.sheetBackdrop} onPress={onClose}>
				<Pressable style={[styles.sheet, { paddingBottom: bottom + 16 }]} onPress={() => {}}>
					<View style={styles.sheetHandle} />
					<Text style={styles.sheetTitle}>Sort by</Text>
					{HISTORY_SORTS.map((option) => {
						const active = option === sort;
						return (
							<TouchableOpacity key={option} style={styles.sheetRow} onPress={() => onSort(option)}>
								<Text style={[styles.sheetRowText, active && styles.sheetRowActive]}>
									{HISTORY_SORT_LABEL[option]}
								</Text>
								{active && <Ionicons name="checkmark" size={20} color={colors.primary} />}
							</TouchableOpacity>
						);
					})}
					{!isMovie && (
						<>
							<View style={styles.sheetFilterHead}>
								<Text style={styles.sheetTitle}>Filter</Text>
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
				</Pressable>
			</Pressable>
		</Modal>
	);
}
