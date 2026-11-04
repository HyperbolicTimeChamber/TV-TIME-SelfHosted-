import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	View,
	Text,
	Modal,
	ActivityIndicator,
	StyleSheet,
	useWindowDimensions,
} from "react-native";
// Gesture-handler Pressable: inside the sheet, React Native's lost a tap whose finger drifted a
// pixel or two (the sheet's gestures took the touch), so a quick first tap often did nothing
import { GestureHandlerRootView, Pressable } from "react-native-gesture-handler";
import GorhomSheet, {
	BottomSheetBackdrop,
	BottomSheetFooter,
	BottomSheetScrollView,
	BottomSheetTextInput,
	useBottomSheet,
	useBottomSheetSpringConfigs,
	type BottomSheetBackdropProps,
	type BottomSheetFooterProps,
} from "@gorhom/bottom-sheet";
import Reanimated, {
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withTiming,
} from "react-native-reanimated";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAuthStore } from "../../stores";
import { useCustomLists } from "../../hooks/useCustomLists";
import {
	ADD_TO_LIST_SEARCH_MIN_LISTS,
	CUSTOM_LIST_ITEM_MAX,
	NEW_LIST_HINTS,
	NEW_LIST_TITLE,
} from "../../enums";
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
	/** No "N titles" under each list (the show info page) */
	hideCounts?: boolean;
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
/** The Done pill floats over the lists (transparent, no bar behind it): its height + the gap
 *  under it. The lists end this far (plus the nav-bar inset) above the sheet's bottom so the
 *  last row can scroll clear of it (styles.footer / done) */
const FOOTER_HEIGHT = 76;
const SEARCH_HEIGHT = 40;

enum ListSort {
	RECENT = "Recent",
	NAME = "A–Z",
}

const NAME_ERRORS = {
	taken: "You already have a list with that name.",
	limit: "You've reached the maximum number of lists.",
	failed: "Couldn't create the list. Check your connection and try again.",
	empty: "Give the list a name.",
} as const;

/**
 * "Add to List": tap the lists a title belongs to (each tap saves at once), or make a new one with
 * it inside. A list is a bookmark — this never starts tracking the title. Laid out like a "save to
 * playlist" sheet: the title's logo on top, "In Lists" (the lists holding it when the sheet opened)
 * with New list, a Find list search + Sort, the other lists, a New list row and a Done button. Rows
 * stay where they are when ticked; the bookmark badge (not a plus) is the toggle.
 */
export default function AddToListSheet({ entry, onClose, hideCounts = false }: Readonly<Props>) {
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
	}, [screenHeight, insets.top, insets.bottom, topHeight, listHeight]);
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
	// Done floats over the lists (the sheet's footer: transparent, always at the visible bottom,
	// whichever snap point the sheet is at); each tap already saved, Done just closes
	const lowestSnap = snapPoints[0];
	const renderFooter = useCallback(
		(props: BottomSheetFooterProps) => (
			<BottomSheetFooter {...props} bottomInset={insets.bottom}>
				<DoneFooter lowestSnap={lowestSnap} onPress={() => sheetRef.current?.close()} />
			</BottomSheetFooter>
		),
		[insets.bottom, lowestSnap],
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
	// Lists that held the title when the sheet opened: the "In Lists" section, fixed while open
	const [openSaved, setOpenSaved] = useState<ReadonlySet<string>>(new Set());
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState(ListSort.RECENT);
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
		if (entry && !loading && !pinned) {
			setPinned(sheetListOrder(lists, null, entry).map((l) => l.id));
			const holding = lists.filter((l) => listHasItem(l, entry.tmdbId, entry.mediaType));
			setOpenSaved(new Set(holding.map((l) => l.id)));
		}
	}, [entry, loading, lists, pinned]);

	// "In Lists": held the title at open (a list made from here joins it). The rest: filtered by
	// the search, in the chosen order
	const saved = useMemo(
		() => ordered.filter((l) => openSaved.has(l.id) || !pinned?.includes(l.id)),
		[ordered, openSaved, pinned],
	);
	const others = useMemo(() => {
		const term = search.trim().toLowerCase();
		const rest = ordered.filter(
			(l) => !saved.includes(l) && (!term || l.name.toLowerCase().includes(term)),
		);
		return sort === ListSort.NAME ? [...rest].sort((a, b) => a.name.localeCompare(b.name)) : rest;
	}, [ordered, saved, search, sort]);
	// Find list + Sort only earn their room with a few lists left to look through (the lists
	// already holding the title sit above); counted before the search filter so typing never hides them
	const searchable = useMemo(
		() => ordered.filter((l) => !saved.includes(l)).length >= ADD_TO_LIST_SEARCH_MIN_LISTS,
		[ordered, saved],
	);

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

	const startNaming = () => {
		setNameError(null);
		setNaming(true);
	};

	const renderRow = (list: CustomList) => {
		if (!entry) return null;
		const has = listHasItem(list, entry.tmdbId, entry.mediaType);
		const full = !has && list.items.length >= CUSTOM_LIST_ITEM_MAX;
		return (
			<ListRow
				key={list.id}
				list={list}
				hint={full ? "List is full" : hideCounts ? null : titleCount(list.items.length)}
				listed={has}
				disabled={full}
				onPress={() => toggle(list, has)}
			/>
		);
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
							footerComponent={renderFooter}
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
							<BottomSheetScrollView
								contentContainerStyle={[
									styles.scrollContent,
									{ paddingBottom: FOOTER_HEIGHT + insets.bottom },
								]}
								keyboardShouldPersistTaps="handled"
								onContentSizeChange={(_, h) => setListHeight(h)}
							>
								{loading ? (
									<ActivityIndicator style={styles.loader} color={colors.primary} />
								) : (
									<>
										{/* Only when it holds the title already: nothing to show for a title in no list */}
										{saved.length > 0 && (
											<>
												<View style={styles.heading}>
													<Text style={styles.headingText}>In Lists</Text>
													<Pressable
														onPress={startNaming}
														hitSlop={10}
														accessibilityRole="button"
														style={({ pressed }) => pressed && styles.newListPressed}
													>
														<Text style={styles.newList}>New List</Text>
													</Pressable>
												</View>
												{saved.map(renderRow)}
											</>
										)}

										{searchable && (
											<View style={styles.searchRow}>
												<View style={styles.searchField}>
													<Ionicons name="search" size={16} color={colors.textSecondary} />
													<BottomSheetTextInput
														style={styles.searchInput}
														value={search}
														onChangeText={setSearch}
														placeholder="Find list"
														placeholderTextColor={colors.textSecondary}
														autoCorrect={false}
														returnKeyType="search"
														accessibilityLabel="Find list"
													/>
												</View>
												<Pressable
													onPress={() =>
														setSort((v) =>
															v === ListSort.RECENT ? ListSort.NAME : ListSort.RECENT,
														)
													}
													accessibilityRole="button"
													accessibilityLabel={`Sort: ${sort}`}
													style={({ pressed }) => [
														styles.sortButton,
														pressed && styles.newListPressed,
													]}
												>
													<Text style={styles.sortText}>
														{sort === ListSort.RECENT ? "Sort" : sort}
													</Text>
												</Pressable>
											</View>
										)}

										{others.map(renderRow)}
										{others.length === 0 && search.trim() !== "" && (
											<Text style={styles.empty}>No list called "{search.trim()}".</Text>
										)}

										<Pressable
											onPress={startNaming}
											accessibilityRole="button"
											style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
										>
											<View style={[styles.cover, styles.coverEmpty]}>
												<MaterialCommunityIcons
													name="bookmark-plus-outline"
													size={24}
													color={colors.text}
												/>
											</View>
											<Text style={styles.rowText}>New List</Text>
										</Pressable>
									</>
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
	hint: string | null;
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
				{hint && <Text style={styles.rowHint}>{hint}</Text>}
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

/**
 * The footer pins Done to the sheet's visible bottom, so while the sheet closes it stayed put
 * until the sheet's top reached it. Below the lowest detent (index between 0 and -1 — closing)
 * it now rides down with the sheet: the share of that detent already gone.
 */
function DoneFooter({ lowestSnap, onPress }: Readonly<{ lowestSnap: number; onPress: () => void }>) {
	const { animatedIndex } = useBottomSheet();
	const closingStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: Math.max(0, -animatedIndex.value) * lowestSnap }],
	}));
	return (
		<Reanimated.View style={[styles.footer, closingStyle]} pointerEvents="box-none">
			<Pressable
				onPress={onPress}
				accessibilityRole="button"
				style={({ pressed }) => [styles.done, pressed && styles.donePressed]}
			>
				<Text style={styles.doneText}>Done</Text>
			</Pressable>
		</Reanimated.View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	sheet: { backgroundColor: colors.surface, borderRadius: 20 },
	handleArea: { paddingVertical: 10 },
	handle: { width: 36, height: 4, backgroundColor: colors.textMuted },
	top: { paddingHorizontal: spacing.lg },
	scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
	searchRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginVertical: spacing.md,
	},
	searchField: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		height: SEARCH_HEIGHT,
		paddingHorizontal: spacing.md,
		borderRadius: 8,
		backgroundColor: colors.surfaceLight,
	},
	searchInput: { flex: 1, ...typography.body, padding: 0 },
	sortButton: {
		height: SEARCH_HEIGHT,
		paddingHorizontal: spacing.md,
		borderRadius: 8,
		backgroundColor: colors.surfaceLight,
		alignItems: "center",
		justifyContent: "center",
	},
	sortText: { ...typography.subtitle, fontSize: 13 },
	footer: { alignItems: "center", paddingBottom: spacing.md },
	done: {
		minWidth: 120,
		paddingVertical: spacing.md,
		paddingHorizontal: spacing.xl,
		borderRadius: 999,
		alignItems: "center",
		backgroundColor: colors.warningAmber,
	},
	donePressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
	doneText: { ...typography.subtitle, fontSize: 15, color: colors.background },
	divider: { height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.border },
	heading: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingTop: spacing.lg,
		paddingBottom: spacing.sm,
	},
	headingText: { ...typography.subtitle, fontSize: 18 },
	newList: { color: colors.warningAmber, fontSize: 15, fontWeight: "600" },
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
	badgeActive: { backgroundColor: colors.warningAmber, borderColor: colors.warningAmber },
	loader: { paddingVertical: spacing.xl },
	empty: {
		color: colors.textSecondary,
		fontSize: 13,
		textAlign: "center",
		paddingVertical: spacing.lg,
	},
});
