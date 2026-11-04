import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import GorhomSheet, {
	BottomSheetBackdrop,
	BottomSheetScrollView,
	useBottomSheetSpringConfigs,
	type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SheetGroup, sheetStyles } from "./modals/BottomSheet";
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

/** Same feel as the app's other sheets (BottomSheet SHEET_SPRING): critically damped, no overshoot */
const SHEET_SPRING = { damping: 30, stiffness: 220, overshootClamping: true } as const;
/** Opens at most this share of the screen; dragging it up (or scrolling) takes it to full */
const PART_WAY_SHARE = 0.5;
/** Grab handle: 10 above + 4 indicator + 10 below (sortSheetStyles.handleArea) */
const HANDLE_HEIGHT = 24;

/**
 * Bottom sheet: "Sort by" rows in one card (checkmark on the active one) + optional extra sections.
 * Built like Add to List: it opens at most half the screen, dragging or scrolling it up grows it
 * with its content up to just under the status bar, then the content scrolls; a pull down with the list at its top drags the sheet (closing it), scrolling
 * the list back up never does.
 */
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
	const insets = useSafeAreaInsets();
	const { height: screenHeight } = useWindowDimensions();
	const sheetRef = useRef<GorhomSheet>(null);
	// Content's full scroll height: the sheet grows only as tall as it needs (never past the top)
	const [contentHeight, setContentHeight] = useState(0);
	const snapPoints = useMemo(() => {
		const partWay = Math.round(screenHeight * PART_WAY_SHARE);
		if (!contentHeight) return [partWay];
		const full = Math.min(Math.ceil(HANDLE_HEIGHT + contentHeight), screenHeight - insets.top);
		return full > partWay ? [partWay, full] : [full];
	}, [screenHeight, insets.top, contentHeight]);
	// A pick made with closeOnSelect: applied once the sheet has slid out
	const afterClose = useRef<(() => void) | null>(null);
	const animationConfigs = useBottomSheetSpringConfigs(SHEET_SPRING);
	const renderBackdrop = useCallback(
		(props: BottomSheetBackdropProps) => (
			<BottomSheetBackdrop
				{...props}
				appearsOnIndex={0}
				disappearsOnIndex={-1}
				opacity={0.6}
				pressBehavior="close"
			/>
		),
		[],
	);
	const pick = (value: T) => {
		if (!closeOnSelect) return onSelect(value);
		afterClose.current = () => onSelect(value);
		sheetRef.current?.close();
	};
	return (
		<Modal
			visible={visible}
			transparent
			animationType="none"
			statusBarTranslucent
			navigationBarTranslucent
			onRequestClose={() => sheetRef.current?.close()}
		>
			<GestureHandlerRootView style={sortSheetStyles.root}>
				{visible && (
					<GorhomSheet
						ref={sheetRef}
						snapPoints={snapPoints}
						enableDynamicSizing={false}
						topInset={insets.top}
						enablePanDownToClose
						// Keyboard up: the sheet rides above it, and settles back once it's gone
						keyboardBlurBehavior="restore"
						animationConfigs={animationConfigs}
						backdropComponent={renderBackdrop}
						backgroundStyle={sortSheetStyles.sheet}
						handleStyle={sortSheetStyles.handleArea}
						handleIndicatorStyle={sortSheetStyles.handle}
						onClose={() => {
							const then = afterClose.current;
							afterClose.current = null;
							onClose();
							then?.();
						}}
					>
						<BottomSheetScrollView
							contentContainerStyle={[
								sortSheetStyles.content,
								// Clear of the system nav bar + a gap
								{ paddingBottom: insets.bottom + spacing.lg },
							]}
							showsVerticalScrollIndicator={false}
							keyboardShouldPersistTaps="handled"
							onContentSizeChange={(_, h) => setContentHeight(h)}
						>
							<Text style={sortSheetStyles.title}>SORT BY</Text>
							{segmented ? (
								<SegmentedControl
									options={options}
									selected={selected}
									isSame={isSame}
									onSelect={pick}
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
												onPress={() => pick(option.value)}
												accessibilityRole="button"
												accessibilityState={{ selected: active }}
											>
												<Text
													style={[sortSheetStyles.rowText, active && sortSheetStyles.rowActive]}
												>
													{option.label}
												</Text>
												{active && <Ionicons name="checkmark" size={20} color={colors.text} />}
											</Pressable>
										);
									})}
								</SheetGroup>
							)}
							{children}
						</BottomSheetScrollView>
					</GorhomSheet>
				)}
			</GestureHandlerRootView>
		</Modal>
	);
}

export const sortSheetStyles = StyleSheet.create({
	root: { flex: 1 },
	sheet: { backgroundColor: colors.surface, borderRadius: 20 },
	handleArea: { paddingVertical: 10 },
	handle: { width: 36, height: 4, backgroundColor: colors.textMuted },
	content: { paddingHorizontal: spacing.lg },
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
