import React from "react";
import { View, Text, StyleSheet } from "react-native";
import BottomSheet, { SheetGroup, SheetOption } from "../../components/modals/BottomSheet";
import type { CustomList } from "../../types";
import { listCoverItem, titleCount } from "../../utils";
import { colors, spacing, typography } from "../../theme";

/**
 * A list's menu (Lists page ⋮ on a card, and a list's own page ⋮): the list's art behind, its name
 * and count on top, rename / share grouped, delete on its own. Each action runs once the sheet has
 * slid away.
 */
export default function ListMenuSheet({
	list,
	onRename,
	onShare,
	onDelete,
	onClose,
}: {
	list: CustomList | null;
	onRename: (list: CustomList) => void;
	onShare: (list: CustomList) => void;
	onDelete: (list: CustomList) => void;
	onClose: () => void;
}) {
	return (
		<BottomSheet visible={!!list} onClose={onClose} art={list ? listCoverItem(list) : null}>
			{(close) =>
				list && (
					<>
						{/* The art behind says which list; the header just names it */}
						<View style={styles.header}>
							<Text style={styles.name} numberOfLines={1}>
								{list.name}
							</Text>
							<Text style={styles.count}>{titleCount(list.items.length)}</Text>
						</View>
						<SheetGroup>
							<SheetOption
								icon="create-outline"
								color={colors.accent}
								title="Rename list"
								onPress={() => close(() => onRename(list))}
							/>
							<SheetOption
								icon="share-outline"
								color={colors.accent}
								title="Share list"
								hint="As a file anyone can import"
								onPress={() => close(() => onShare(list))}
							/>
						</SheetGroup>
						<View style={styles.gap} />
						<SheetGroup>
							<SheetOption
								icon="trash-outline"
								color={colors.destructiveRed}
								title="Delete list"
								hint="Removes the list, not the titles"
								destructive
								onPress={() => close(() => onDelete(list))}
							/>
						</SheetGroup>
					</>
				)
			}
		</BottomSheet>
	);
}

const styles = StyleSheet.create({
	header: { marginBottom: spacing.lg },
	name: { ...typography.subtitle, fontSize: 20 },
	count: {
		...typography.caption,
		fontSize: 13,
		color: colors.text,
		opacity: 0.8,
		marginTop: 2,
	},
	gap: { height: spacing.md },
});
