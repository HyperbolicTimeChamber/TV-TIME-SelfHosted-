import React, { useEffect, useMemo, useRef, useState } from "react";
import {
	View,
	Text,
	Pressable,
	ScrollView,
	ActivityIndicator,
	StyleSheet,
	Dimensions,
} from "react-native";
import Reanimated, {
	Easing,
	Extrapolation,
	interpolate,
	useAnimatedScrollHandler,
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "../../stores";
import { useCustomLists } from "../../hooks/useCustomLists";
import { CUSTOM_LIST_ITEM_MAX } from "../../enums";
import type { CustomList, CustomListEntry } from "../../types";
import { listHasItem, sheetListOrder, titleCount } from "../../utils";
import { colors, spacing } from "../../theme";
import BottomSheet, { SheetHeader, SheetOption, sheetStyles } from "./BottomSheet";
import ListNameModal from "./ListNameModal";

interface Props {
	/** The title being listed; null = closed */
	entry: CustomListEntry | null;
	onClose: () => void;
}

const SCREEN_HEIGHT = Dimensions.get("window").height;
/** Scrolled this far, the shadow under the Create row is fully in */
const SHADOW_IN_DISTANCE = 16;
/** The lists' scroll, at most this much of the screen (the part under the nav bar included) */
const LIST_MAX_HEIGHT = SCREEN_HEIGHT * 0.55;
/** Strong ease-out: the tick answers the tap at once */
const TICK_EASE = Easing.bezier(0.23, 1, 0.32, 1);

const NAME_ERRORS = {
	taken: "You already have a list with that name.",
	limit: "You've reached the maximum number of lists.",
	failed: "Couldn't create the list. Check your connection and try again.",
	empty: "Give the list a name.",
} as const;

/**
 * "Add to List": tick the lists a title belongs to (each tap saves at once), or create a new one
 * with it inside. A list is a bookmark — this never starts tracking the title. Same shell as the
 * watch count sheet: the title's logo (its name after a wait when there's none), grouped rows.
 */
export default function AddToListSheet({ entry, onClose }: Readonly<Props>) {
	const insets = useSafeAreaInsets();
	// The sheet's own bottom padding (BottomSheet) — the card runs through it to the screen edge,
	// and the same space closes the scroll so the last row clears the nav bar
	const bleed = insets.bottom + spacing.lg;
	const user = useAuthStore((s) => s.user);
	// Follows the scroll: rows read as sliding under the Create row, not cut off at it
	const scrollY = useSharedValue(0);
	const onScroll = useAnimatedScrollHandler((e) => {
		scrollY.value = e.contentOffset.y;
	});
	const shadowStyle = useAnimatedStyle(() => ({
		opacity: interpolate(scrollY.value, [0, SHADOW_IN_DISTANCE], [0, 1], Extrapolation.CLAMP),
	}));
	const { lists, loading, createList, addToList, removeFromList } = useCustomLists(user?.uid);
	const [naming, setNaming] = useState(false);
	const [creating, setCreating] = useState(false);
	const [nameError, setNameError] = useState<string | null>(null);
	// Order the sheet opened with (most recently created / modified first) — held while it is open
	const [pinned, setPinned] = useState<string[] | null>(null);
	const ordered = useMemo(() => sheetListOrder(lists, pinned), [lists, pinned]);

	useEffect(() => {
		if (!entry) {
			setNaming(false);
			setNameError(null);
			setPinned(null);
		}
	}, [entry]);

	useEffect(() => {
		if (entry && !loading && !pinned) setPinned(sheetListOrder(lists, null).map((l) => l.id));
	}, [entry, loading, lists, pinned]);

	const handleCreate = async (name: string) => {
		if (!entry) return;
		setCreating(true);
		const result = await createList(name, entry);
		setCreating(false);
		// Back to the sheet: the new list shows ticked with its count, confirming the add
		if (result.ok) setNaming(false);
		else setNameError(NAME_ERRORS[result.reason]);
	};

	const toggle = (list: CustomList, has: boolean) => {
		if (!entry) return;
		Haptics.selectionAsync().catch(() => {});
		if (has) removeFromList(list.id, entry.tmdbId, entry.mediaType);
		else addToList(list.id, entry);
	};

	return (
		<>
			{/* Naming swaps the sheet for the name popup; creating or cancelling brings the sheet back */}
			<BottomSheet visible={!!entry && !naming} onClose={onClose}>
				{() =>
					entry && (
						<>
							<SheetHeader
								title={entry.title}
								subtitle="Add to List"
								tmdbId={entry.tmdbId}
								mediaType={entry.mediaType}
								centered
							/>
							{/* One card: Create fixed on top, the lists scroll under it and run off the bottom
							    edge; scrolled to the end, a nav-bar-high gap closes it */}
							<View style={[styles.card, { marginBottom: -bleed }]}>
								<View style={styles.createRow}>
									<SheetOption
										icon="add"
										color={colors.accent}
										title="Create New List"
										hint="Starts with this title"
										onPress={() => {
											setNameError(null);
											setNaming(true);
										}}
									/>
									<View style={styles.divider} />
								</View>
								<View>
									<Reanimated.ScrollView
										onScroll={onScroll}
										scrollEventThrottle={16}
										style={{ maxHeight: LIST_MAX_HEIGHT }}
										contentContainerStyle={{ paddingBottom: bleed }}
										bounces={false}
										keyboardShouldPersistTaps="handled"
										nestedScrollEnabled
									>
										<View style={styles.rows}>
											{loading ? (
												<ActivityIndicator style={styles.loader} color={colors.primary} />
											) : ordered.length === 0 ? (
												<Text style={styles.empty}>You don't have any lists yet.</Text>
											) : (
												ordered.map((list, i) => {
													const has = listHasItem(list, entry.tmdbId, entry.mediaType);
													const full = !has && list.items.length >= CUSTOM_LIST_ITEM_MAX;
													return (
														<React.Fragment key={list.id}>
															{i > 0 && <View style={styles.separator} />}
															<ListRow
																name={list.name}
																hint={full ? "List is full" : titleCount(list.items.length)}
																checked={has}
																disabled={full}
																onPress={() => toggle(list, has)}
															/>
														</React.Fragment>
													);
												})
											)}
										</View>
									</Reanimated.ScrollView>
									<Reanimated.View pointerEvents="none" style={[styles.shadow, shadowStyle]}>
										<LinearGradient colors={SHADOW_COLORS} style={StyleSheet.absoluteFill} />
									</Reanimated.View>
								</View>
							</View>
						</>
					)
				}
			</BottomSheet>

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

/** One list: name + count, the tick on the right; scales a touch on press */
function ListRow({
	name,
	hint,
	checked,
	disabled,
	onPress,
}: {
	name: string;
	hint: string;
	checked: boolean;
	disabled: boolean;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			accessibilityRole="checkbox"
			accessibilityState={{ checked, disabled }}
			style={({ pressed }) => [
				sheetStyles.row,
				pressed && styles.rowPressed,
				disabled && styles.rowDisabled,
			]}
		>
			<View style={sheetStyles.rowContent}>
				<Text style={sheetStyles.rowText} numberOfLines={1}>
					{name}
				</Text>
				<Text style={sheetStyles.rowHint}>{hint}</Text>
			</View>
			<Tick checked={checked} />
		</Pressable>
	);
}

/** Ring ↔ filled check; a change dips it to 0.85 and settles back (never grows from nothing) */
function Tick({ checked }: { checked: boolean }) {
	const scale = useSharedValue(1);
	// Mount shows the state as it is; only a change animates
	const mounted = useRef(false);
	useEffect(() => {
		if (!mounted.current) {
			mounted.current = true;
			return;
		}
		scale.value = withSequence(
			withTiming(0.85, { duration: 70, easing: TICK_EASE }),
			withTiming(1, { duration: 180, easing: TICK_EASE }),
		);
	}, [checked, scale]);
	const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
	return (
		<Reanimated.View style={style}>
			<Ionicons
				name={checked ? "checkmark-circle" : "ellipse-outline"}
				size={26}
				color={checked ? colors.accent : colors.textMuted}
			/>
		</Reanimated.View>
	);
}

const CARD_RADIUS = 14;
const SHADOW_COLORS = ["rgba(0, 0, 0, 0.35)", "rgba(0, 0, 0, 0)"] as const;

const styles = StyleSheet.create({
	// Rounds the Create row's top corners; the bottom runs off the screen
	card: { borderTopLeftRadius: CARD_RADIUS, borderTopRightRadius: CARD_RADIUS, overflow: "hidden" },
	createRow: { backgroundColor: colors.surfaceDim },
	// Full width: closes the Create row off from the lists
	divider: { height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.border },
	// On the scroll's top edge, just under the divider
	shadow: { position: "absolute", left: 0, right: 0, top: 0, height: 10 },
	rows: {
		backgroundColor: colors.surfaceLight,
		borderBottomLeftRadius: CARD_RADIUS,
		borderBottomRightRadius: CARD_RADIUS,
		overflow: "hidden",
	},
	// 2 hairlines: a single one lands between pixels while scrolling and blinks out
	separator: {
		height: StyleSheet.hairlineWidth * 2,
		backgroundColor: colors.border,
		marginLeft: spacing.md,
	},
	rowPressed: { backgroundColor: colors.border, transform: [{ scale: 0.98 }] },
	rowDisabled: { opacity: 0.4 },
	loader: { paddingVertical: spacing.xl },
	empty: {
		color: colors.textSecondary,
		fontSize: 13,
		textAlign: "center",
		paddingVertical: spacing.lg,
	},
});
