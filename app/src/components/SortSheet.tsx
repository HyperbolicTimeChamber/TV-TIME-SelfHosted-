import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
	/** Extra sections under the sort rows (e.g. Watch History's filters) */
	children?: ReactNode;
}

const strictEqual = <T,>(a: T, b: T) => a === b;

/** Bottom sheet: "Sort by" rows (checkmark on the active one) + optional extra sections */
export default function SortSheet<T>({
	visible,
	onClose,
	options,
	selected,
	onSelect,
	isSame = strictEqual,
	children,
}: Props<T>) {
	const { bottom } = useSafeAreaInsets();
	return (
		<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
			<Pressable style={sortSheetStyles.backdrop} onPress={onClose}>
				<Pressable
					style={[sortSheetStyles.sheet, { paddingBottom: bottom + 16 }]}
					onPress={() => {}}
				>
					<View style={sortSheetStyles.handle} />
					<Text style={sortSheetStyles.title}>Sort by</Text>
					{options.map((option) => {
						const active = isSame(option.value, selected);
						return (
							<TouchableOpacity
								key={option.label}
								style={sortSheetStyles.row}
								onPress={() => onSelect(option.value)}
								accessibilityState={{ selected: active }}
							>
								<Text style={[sortSheetStyles.rowText, active && sortSheetStyles.rowActive]}>
									{option.label}
								</Text>
								{active && <Ionicons name="checkmark" size={20} color={colors.primary} />}
							</TouchableOpacity>
						);
					})}
					{children}
				</Pressable>
			</Pressable>
		</Modal>
	);
}

export const sortSheetStyles = StyleSheet.create({
	backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlayLight },
	sheet: {
		backgroundColor: colors.surface,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		paddingHorizontal: spacing.lg,
		paddingTop: spacing.sm,
	},
	handle: {
		alignSelf: "center",
		width: 40,
		height: 4,
		borderRadius: 2,
		backgroundColor: colors.border,
		marginBottom: spacing.md,
	},
	title: {
		fontSize: 13,
		fontWeight: "700",
		color: colors.textSecondary,
		letterSpacing: 1,
		marginVertical: spacing.sm,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: spacing.md,
	},
	rowText: { fontSize: 16, color: colors.text },
	rowActive: { fontWeight: "700" },
});
