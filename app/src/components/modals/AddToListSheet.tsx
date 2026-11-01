import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	View,
	Text,
	Pressable,
	Modal,
	ActivityIndicator,
	StyleSheet,
	useWindowDimensions,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import GorhomSheet, {
	BottomSheetBackdrop,
	BottomSheetScrollView,
	useBottomSheetSpringConfigs,
	type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import Reanimated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "../../stores";
import { useCustomLists } from "../../hooks/useCustomLists";
import { CUSTOM_LIST_ITEM_MAX, NEW_LIST_HINTS, NEW_LIST_TITLE } from "../../enums";
import type { CustomList, CustomListEntry } from "../../types";
import { listCoverItem, listHasItem, sheetListOrder, titleCount } from "../../utils";
import { colors, spacing, typography } from "../../theme";
import PosterImage from "../PosterImage";
import { SheetHeader } from "./BottomSheet";
import ListNameModal from "./ListNameModal";
import { ModalArt, NEW_LIST_ART, NEW_LIST_RATIO } from "./ModalArt";

interface Props {
	/** The title being listed; null = closed */
	entry: CustomListEntry | null;
	onClose: () => void;
}

/** Opens at most this share of the screen; scrolling the lists first grows it to fit them */
const PART_WAY_SHARE = 0.6;
/** Grab handle: 10 above + 4 indicator + 10 below (styles.handleArea) */
const HANDLE_HEIGHT = 24;
/** Same feel as the app's other sheets (BottomSheet SHEET_SPRING): critically damped, no overshoot */
const SHEET_SPRING = { damping: 30, stiffness: 220, overshootClamping: true } as const;
/** Strong ease-out: the badge answers the tap at once */
const TAP_EASE = Easing.bezier(0.23, 1, 0.32, 1);
const COVER_SIZE = 52;
/** Same badge as the search cards' Add to List button */
const BADGE_SIZE = 30;

const NAME_ERRORS = {
	taken: "You already have a list with that name.",
	limit: "You've reached the maximum number of lists.",
	failed: "Couldn't create the list. Check your connection and try again.",
	empty: "Give the list a name.",
} as const;

/**
 * "Add to List": tap the lists a title belongs to (each tap saves at once), or make a new one with
 * it inside. A list is a bookmark — this never starts tracking the title. Laid out like a "save to
 * collection" sheet: the title's logo on top, a Lists heading with New list, then the lists
 * (cover, name, count) with the search cards' bookmark badge.
 */
export default function AddToListSheet({ entry, onClose }: Readonly<Props>) {
	const insets = useSafeAreaInsets();
	const sheetRef = useRef<GorhomSheet>(null);
	const { height: screenHeight } = useWindowDimensions();
	// Logo + divider, and the lists' full scroll height (nav-bar gap included) — the sheet grows
	// only as tall as these need (never past the top), so it never shows empty space
	const [topHeight, setTopHeight] = useState(0);
	const [listHeight, setListHeight] = useState(0);
	const snapPoints = useMemo(() => {
		const maxHeight = screenHeight - insets.top;
		const partWay = Math.round(screenHeight * PART_WAY_SHARE);
		if (!topHeight || !listHeight) return [partWay];
		const full = Math.min(Math.ceil(HANDLE_HEIGHT + topHeight + listHeight), maxHeight);
		return full > partWay ? [partWay, full] : [full];
	}, [screenHeight, insets.top, topHeight, listHeight]);
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
	const user = useAuthStore((s) => s.user);
	const { lists, loading, createList, addToList, removeFromList } = useCustomLists(user?.uid);
	const [naming, setNaming] = useState(false);
	// Swapping to the name popup unmounts the sheet, which reports a close — that one isn't the
	// user closing it (it cleared the entry and the popup never showed)
	const namingRef = useRef(false);
	namingRef.current = naming;
	const [creating, setCreating] = useState(false);
	const [nameError, setNameError] = useState<string | null>(null);
	// Order the sheet opened with (lists holding the title, then newest) — held while it is open
	const [pinned, setPinned] = useState<string[] | null>(null);
	const ordered = useMemo(
		() => sheetListOrder(lists, pinned, entry ?? undefined),
		[lists, pinned, entry],
	);

	useEffect(() => {
		if (!entry) {
			setNaming(false);
			setNameError(null);
			setPinned(null);
		}
	}, [entry]);

	useEffect(() => {
		if (entry && !loading && !pinned)
			setPinned(sheetListOrder(lists, null, entry).map((l) => l.id));
	}, [entry, loading, lists, pinned]);

	const handleCreate = async (name: string) => {
		if (!entry) return;
		setCreating(true);
		const result = await createList(name, entry);
		setCreating(false);
		// Back to the sheet: the new list shows on top, bookmarked, confirming the add
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
			<Modal
				visible={!!entry && !naming}
				transparent
				animationType="none"
				statusBarTranslucent
				navigationBarTranslucent
				onRequestClose={() => sheetRef.current?.close()}
			>
				<GestureHandlerRootView style={styles.root}>
					{entry && (
						<GorhomSheet
							ref={sheetRef}
							snapPoints={snapPoints}
							enableDynamicSizing={false}
							topInset={insets.top}
							enablePanDownToClose
							animationConfigs={animationConfigs}
							backdropComponent={renderBackdrop}
							backgroundStyle={styles.sheet}
							handleStyle={styles.handleArea}
							handleIndicatorStyle={styles.handle}
							onClose={() => {
								if (!namingRef.current) onClose();
							}}
						>
							<View onLayout={(e) => setTopHeight(e.nativeEvent.layout.height)}>
								<View style={styles.top}>
									<SheetHeader
										title={entry.title}
										tmdbId={entry.tmdbId}
										mediaType={entry.mediaType}
										centered
									/>
								</View>
								<View style={styles.divider} />
							</View>
							{/* The heading scrolls away with the lists; they run under the nav bar and,
							    scrolled to the end, a nav-bar-high gap closes them */}
							<BottomSheetScrollView
								contentContainerStyle={[
									styles.scrollContent,
									{ paddingBottom: insets.bottom + spacing.lg },
								]}
								keyboardShouldPersistTaps="handled"
								onContentSizeChange={(_, h) => setListHeight(h)}
							>
								<View style={styles.heading}>
									<Text style={styles.headingText}>Lists</Text>
									<Pressable
										onPress={() => {
											setNameError(null);
											setNaming(true);
										}}
										hitSlop={10}
										accessibilityRole="button"
										style={({ pressed }) => pressed && styles.newListPressed}
									>
										<Text style={styles.newList}>New list</Text>
									</Pressable>
								</View>

								{loading ? (
									<ActivityIndicator style={styles.loader} color={colors.primary} />
								) : ordered.length === 0 ? (
									<Text style={styles.empty}>No lists yet — make one with New list.</Text>
								) : (
									ordered.map((list) => {
										const has = listHasItem(list, entry.tmdbId, entry.mediaType);
										const full = !has && list.items.length >= CUSTOM_LIST_ITEM_MAX;
										return (
											<ListRow
												key={list.id}
												list={list}
												hint={full ? "List is full" : titleCount(list.items.length)}
												listed={has}
												disabled={full}
												onPress={() => toggle(list, has)}
											/>
										);
									})
								)}
							</BottomSheetScrollView>
						</GorhomSheet>
					)}
				</GestureHandlerRootView>
			</Modal>

			<ListNameModal
				visible={!!entry && naming}
				title={NEW_LIST_TITLE}
				image={<ModalArt source={NEW_LIST_ART} ratio={NEW_LIST_RATIO} />}
				hint={NEW_LIST_HINTS}
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

/** One list: its cover (the title added last), name + count, the bookmark badge on the right */
function ListRow({
	list,
	hint,
	listed,
	disabled,
	onPress,
}: {
	list: CustomList;
	hint: string;
	listed: boolean;
	disabled: boolean;
	onPress: () => void;
}) {
	const cover = listCoverItem(list);
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			accessibilityRole="checkbox"
			accessibilityLabel={list.name}
			accessibilityState={{ checked: listed, disabled }}
			style={({ pressed }) => [
				styles.row,
				pressed && styles.rowPressed,
				disabled && styles.rowDisabled,
			]}
		>
			{cover ? (
				<PosterImage
					posterPath={cover.posterPath}
					mediaType={cover.mediaType}
					style={styles.cover}
				/>
			) : (
				<View style={[styles.cover, styles.coverEmpty]}>
					<Ionicons name="list" size={22} color={colors.textMuted} />
				</View>
			)}
			<View style={styles.rowContent}>
				<Text style={styles.rowText} numberOfLines={1}>
					{list.name}
				</Text>
				<Text style={styles.rowHint}>{hint}</Text>
			</View>
			<Badge listed={listed} />
		</Pressable>
	);
}

/** The search cards' Add to List badge: outline bookmark, filled blue once listed. A change dips
 *  it to 0.85 and settles back (never grows from nothing) */
function Badge({ listed }: { listed: boolean }) {
	const scale = useSharedValue(1);
	// Mount shows the state as it is; only a change animates
	const mounted = useRef(false);
	useEffect(() => {
		if (!mounted.current) {
			mounted.current = true;
			return;
		}
		scale.value = withSequence(
			withTiming(0.85, { duration: 70, easing: TAP_EASE }),
			withTiming(1, { duration: 180, easing: TAP_EASE }),
		);
	}, [listed, scale]);
	const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
	return (
		<Reanimated.View style={[styles.badge, listed && styles.badgeActive, style]}>
			<Ionicons name={listed ? "bookmark" : "bookmark-outline"} size={15} color={colors.text} />
		</Reanimated.View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	sheet: { backgroundColor: colors.surface, borderRadius: 20 },
	handleArea: { paddingVertical: 10 },
	handle: { width: 36, height: 4, backgroundColor: colors.textMuted },
	top: { paddingHorizontal: spacing.lg },
	scrollContent: { paddingHorizontal: spacing.lg },
	divider: { height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.border },
	heading: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingTop: spacing.lg,
		paddingBottom: spacing.sm,
	},
	headingText: { ...typography.subtitle, fontSize: 18 },
	newList: { color: colors.accent, fontSize: 15, fontWeight: "600" },
	newListPressed: { opacity: 0.6 },
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingVertical: spacing.sm,
	},
	rowPressed: { opacity: 0.6, transform: [{ scale: 0.98 }] },
	rowDisabled: { opacity: 0.4 },
	cover: { width: COVER_SIZE, height: COVER_SIZE, borderRadius: 10, overflow: "hidden" },
	coverEmpty: {
		backgroundColor: colors.surfaceLight,
		alignItems: "center",
		justifyContent: "center",
	},
	rowContent: { flex: 1, minWidth: 0 },
	rowText: { ...typography.subtitle, fontSize: 16 },
	rowHint: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
	badge: {
		width: BADGE_SIZE,
		height: BADGE_SIZE,
		borderRadius: BADGE_SIZE / 2,
		borderWidth: 2,
		borderColor: colors.text,
		backgroundColor: colors.badgeOverlay,
		alignItems: "center",
		justifyContent: "center",
	},
	badgeActive: { backgroundColor: colors.accent, borderColor: colors.accent },
	loader: { paddingVertical: spacing.xl },
	empty: {
		color: colors.textSecondary,
		fontSize: 13,
		textAlign: "center",
		paddingVertical: spacing.lg,
	},
});
