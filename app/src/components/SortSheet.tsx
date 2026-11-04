import { useContext, useRef, type ReactNode } from "react";
import { Dimensions, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import BottomSheet, { SheetGroup, SheetScrollContext, sheetStyles } from "./modals/BottomSheet";
import SegmentedControl from "./SegmentedControl";
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
	/** Two or three options: one sliding segmented control instead of rows */
	segmented?: boolean;
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
	segmented = false,
}: Props<T>) {
	return (
		<BottomSheet visible={visible} onClose={onClose}>
			{(close) => (
				// Content past most of the screen scrolls instead of pushing the top off-screen
				// (Watch History's filters with every studio shown)
				<SheetScroller>
					<Text style={sortSheetStyles.title}>SORT BY</Text>
					{segmented ? (
						<SegmentedControl
							options={options}
							selected={selected}
							isSame={isSame}
							onSelect={(value) => (closeOnSelect ? close(() => onSelect(value)) : onSelect(value))}
						/>
					) : (
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
					)}
					{children}
				</SheetScroller>
			)}
		</BottomSheet>
	);
}

/** The sheet's content, scrolling past SCROLL_MAX_HEIGHT; tells the sheet whether it scrolls and
 *  where it is (SheetScrollContext) so pulling the list back up never closes the sheet */
function SheetScroller({ children }: { children: ReactNode }) {
	const scroll = useContext(SheetScrollContext);
	const size = useRef({ box: 0, content: 0 });
	const measure = () => {
		if (scroll) scroll.scrollable.current = size.current.content > size.current.box + 1;
	};
	return (
		<ScrollView
			style={sortSheetStyles.scroll}
			bounces={false}
			overScrollMode="never"
			showsVerticalScrollIndicator={false}
			keyboardShouldPersistTaps="handled"
			scrollEventThrottle={16}
			onScroll={(e) => {
				if (scroll) scroll.offset.current = e.nativeEvent.contentOffset.y;
			}}
			onLayout={(e) => {
				size.current.box = e.nativeEvent.layout.height;
				measure();
			}}
			onContentSizeChange={(_, h) => {
				size.current.content = h;
				measure();
			}}
		>
			{children}
		</ScrollView>
	);
}

export const sortSheetStyles = StyleSheet.create({
	scroll: { maxHeight: Dimensions.get("window").height * 0.8, flexGrow: 0 },
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
