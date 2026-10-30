import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import BottomSheet, { SheetGroup, sheetStyles } from "./modals/BottomSheet";
import { colors, spacing } from "../theme";

export interface SortOption<T> {
	value: T;
	label: string;
}

interface Props<T> {
	visible: boolean;
	onClose: () => void;
	options: readonly SortOption<T>[];
	selected: T;
	onSelect: (value: T) => void;
	/** Option values that aren't primitives (e.g. { sort, direction }) */
	isSame?: (a: T, b: T) => boolean;
	/** Slide the sheet out first, then apply the pick (Search) — a parent flipping `visible`
	 *  off itself would cut the exit animation */
	closeOnSelect?: boolean;
	/** Extra sections under the sort rows (e.g. Watch History's filters) */
	children?: ReactNode;
}

const strictEqual = <T,>(a: T, b: T) => a === b;

/** Bottom sheet: "Sort by" rows in one card (checkmark on the active one) + optional extra sections */
export default function SortSheet<T>({
	visible,
	onClose,
	options,
	selected,
	onSelect,
	isSame = strictEqual,
	closeOnSelect = false,
	children,
}: Props<T>) {
	return (
		<BottomSheet visible={visible} onClose={onClose}>
			{(close) => (
				<>
					<Text style={sortSheetStyles.title}>SORT BY</Text>
					<SheetGroup textOnly>
						{options.map((option) => {
							const active = isSame(option.value, selected);
							return (
								<Pressable
									key={option.label}
									style={({ pressed }) => [
										sheetStyles.row,
										sortSheetStyles.row,
										active && sortSheetStyles.rowSelected,
										pressed && !active && sortSheetStyles.rowPressed,
									]}
									onPress={() =>
										closeOnSelect ? close(() => onSelect(option.value)) : onSelect(option.value)
									}
									accessibilityRole="button"
									accessibilityState={{ selected: active }}
								>
									<Text style={[sortSheetStyles.rowText, active && sortSheetStyles.rowActive]}>
										{option.label}
									</Text>
									{active && <Ionicons name="checkmark" size={20} color={colors.text} />}
								</Pressable>
							);
						})}
					</SheetGroup>
					{children}
				</>
			)}
		</BottomSheet>
	);
}

export const sortSheetStyles = StyleSheet.create({
	/** Section label over a card ("SORT BY", "FILTER") */
	title: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textSecondary,
		letterSpacing: 1.2,
		marginBottom: spacing.sm,
		marginLeft: spacing.xs,
	},
	row: { justifyContent: "space-between", minHeight: 48 },
	rowSelected: { backgroundColor: colors.primaryDark },
	rowPressed: { backgroundColor: colors.border },
	rowText: { fontSize: 16, color: colors.textSecondary },
	rowActive: { color: colors.text, fontWeight: "700" },
});
