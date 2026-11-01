import React, { useEffect, useRef, useState } from "react";
import {
	View,
	Text,
	Pressable,
	Modal,
	Animated,
	PanResponder,
	ScrollView,
	ActivityIndicator,
	StyleSheet,
	Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../stores";
import { useCustomLists } from "../../hooks/useCustomLists";
import { CUSTOM_LIST_ITEM_MAX } from "../../enums";
import type { CustomListEntry } from "../../types";
import { listHasItem, titleCount } from "../../utils";
import { colors, spacing, typography } from "../../theme";
import ListNameModal from "./ListNameModal";

interface Props {
	/** The title being listed; null = closed */
	entry: CustomListEntry | null;
	onClose: () => void;
}

const SCREEN_HEIGHT = Dimensions.get("window").height;

/** Same critically damped spring as WatchActionSheet — never overshoots the bottom edge */
const SHEET_SPRING = {
	toValue: 0,
	damping: 30,
	stiffness: 220,
	overshootClamping: true,
	useNativeDriver: true,
} as const;

const NAME_ERRORS = {
	taken: "You already have a list with that name.",
	limit: "You've reached the maximum number of lists.",
	failed: "Couldn't create the list. Check your connection and try again.",
	empty: "Give the list a name.",
} as const;

/**
 * "Add to List": tick the lists a title belongs to (each tap saves at once), or create a new one
 * with it inside. A list is a bookmark — this never starts tracking the title.
 *
 * Touch layout matters here (a tap on a list used to need two tries on a phone): the dismiss
 * target sits *behind* the sheet, not around it (a touch responder wrapped around the rows takes
 * the first touch), the drag-to-close pan lives on the header only (a pan responder over the rows
 * claims a finger that wobbles a little), and the scroll view lets taps through (`handled`).
 */
export default function AddToListSheet({ entry, onClose }: Readonly<Props>) {
	const insets = useSafeAreaInsets();
	const user = useAuthStore((s) => s.user);
	const { lists, loading, createList, addToList, removeFromList } = useCustomLists(user?.uid);
	const [naming, setNaming] = useState(false);
	const [creating, setCreating] = useState(false);
	const [nameError, setNameError] = useState<string | null>(null);

	// Naming swaps the sheet for the name popup; cancelling it brings the sheet back
	const visible = !!entry && !naming;
	const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

	useEffect(() => {
		if (visible) Animated.spring(translateY, SHEET_SPRING).start();
		else translateY.setValue(SCREEN_HEIGHT);
	}, [visible, translateY]);

	useEffect(() => {
		if (!entry) {
			setNaming(false);
			setNameError(null);
		}
	}, [entry]);

	const slideOut = () => {
		Animated.timing(translateY, {
			toValue: SCREEN_HEIGHT,
			duration: 200,
			useNativeDriver: true,
		}).start(() => onClose());
	};

	// Header only: drag down to close
	const panResponder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onPanResponderMove: (_, gs) => {
				if (gs.dy > 0) translateY.setValue(gs.dy);
			},
			onPanResponderRelease: (_, gs) => {
				if (gs.dy > 80 || gs.vy > 0.5) slideOut();
				else Animated.spring(translateY, SHEET_SPRING).start();
			},
			onPanResponderTerminate: () => Animated.spring(translateY, SHEET_SPRING).start(),
		}),
	).current;

	const handleCreate = async (name: string) => {
		if (!entry) return;
		setCreating(true);
		const result = await createList(name, entry);
		setCreating(false);
		if (result.ok) {
			setNaming(false);
			onClose();
		} else {
			setNameError(NAME_ERRORS[result.reason]);
		}
	};

	return (
		<>
			<Modal visible={visible} transparent animationType="none" onRequestClose={slideOut}>
				<View style={styles.overlay}>
					<Pressable style={StyleSheet.absoluteFill} onPress={slideOut} />
					<Animated.View
						style={[
							styles.sheet,
							{ paddingBottom: Math.max(34, insets.bottom + 16), transform: [{ translateY }] },
						]}
					>
						<View {...panResponder.panHandlers}>
							<View style={styles.handle} />
							<Text style={styles.title}>Add to List</Text>
							<Text style={styles.subtitle} numberOfLines={1}>
								{entry?.title}
							</Text>
						</View>

						<Pressable
							style={styles.option}
							onPress={() => {
								setNameError(null);
								setNaming(true);
							}}
						>
							<Ionicons name="add-circle" size={26} color={colors.accent} style={styles.icon} />
							<Text style={[styles.optionText, { color: colors.accent }]}>Create New List</Text>
						</Pressable>

						{loading ? (
							<ActivityIndicator style={styles.loader} color={colors.primary} />
						) : lists.length === 0 ? (
							<Text style={styles.empty}>You don't have any lists yet.</Text>
						) : (
							<ScrollView
								style={styles.listScroll}
								bounces={false}
								keyboardShouldPersistTaps="handled"
								nestedScrollEnabled
							>
								{lists.map((list) => {
									const has = !!entry && listHasItem(list, entry.tmdbId, entry.mediaType);
									const full = !has && list.items.length >= CUSTOM_LIST_ITEM_MAX;
									return (
										<Pressable
											key={list.id}
											style={({ pressed }) => [
												styles.option,
												(full || pressed) && { opacity: full ? 0.4 : 0.6 },
											]}
											disabled={full || !entry}
											onPress={() =>
												entry &&
												(has
													? removeFromList(list.id, entry.tmdbId, entry.mediaType)
													: addToList(list.id, entry))
											}
										>
											<View style={styles.optionContent}>
												<Text style={styles.optionText} numberOfLines={1}>
													{list.name}
												</Text>
												<Text style={styles.optionHint}>
													{full ? "List is full" : titleCount(list.items.length)}
												</Text>
											</View>
											<Ionicons
												name={has ? "checkmark-circle" : "ellipse-outline"}
												size={26}
												color={has ? colors.accent : colors.textMuted}
											/>
										</Pressable>
									);
								})}
							</ScrollView>
						)}
					</Animated.View>
				</View>
			</Modal>

			<ListNameModal
				visible={!!entry && naming}
				title="New List"
				confirmLabel="Create & Add"
				error={nameError}
				loading={creating}
				onSubmit={handleCreate}
				onClose={() => {
					setNaming(false);
					setNameError(null);
				}}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
		backgroundColor: colors.overlayLight,
		justifyContent: "flex-end",
	},
	sheet: {
		backgroundColor: colors.surface,
		borderTopLeftRadius: 16,
		borderTopRightRadius: 16,
		paddingHorizontal: spacing.lg,
	},
	handle: {
		width: 36,
		height: 4,
		borderRadius: 2,
		backgroundColor: colors.textMuted,
		alignSelf: "center",
		marginTop: spacing.sm,
		marginBottom: spacing.md,
	},
	title: {
		...typography.subtitle,
		fontSize: 16,
		textAlign: "center",
	},
	subtitle: {
		...typography.caption,
		textAlign: "center",
		marginTop: spacing.xs,
		marginBottom: spacing.lg,
	},
	option: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: spacing.md,
		borderTopWidth: 1,
		borderTopColor: colors.border,
	},
	icon: { width: 36, marginRight: spacing.xs },
	optionContent: { flex: 1, marginRight: spacing.sm },
	optionText: {
		...typography.subtitle,
		fontSize: 15,
	},
	optionHint: {
		...typography.caption,
		fontSize: 12,
		marginTop: 2,
	},
	listScroll: { maxHeight: SCREEN_HEIGHT * 0.4 },
	loader: { paddingVertical: spacing.xl },
	empty: {
		...typography.caption,
		textAlign: "center",
		paddingVertical: spacing.lg,
		borderTopWidth: 1,
		borderTopColor: colors.border,
	},
});
