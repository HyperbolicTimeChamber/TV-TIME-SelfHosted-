import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Alert } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Gesture } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import ReorderableList, {
	useReorderableDrag,
	useReorderableDragEnd,
	useReorderableDragStart,
	type ReorderableListReorderEvent,
} from "react-native-reorderable-list";
import { useAuthStore } from "../../stores";
import { useCustomLists } from "../../hooks";
import { CircleButtonTone, MediaType, NEW_LIST_HINTS, NEW_LIST_TITLE, Route } from "../../enums";
import type { CustomList, ProfileStackParamList } from "../../types";
import { ConfirmModal, ListNameModal } from "../../components";
import BottomSheet, { SheetGroup, SheetOption } from "../../components/modals/BottomSheet";
import { ModalArt, NEW_LIST_ART, NEW_LIST_RATIO } from "../../components/modals/ModalArt";
import ListMenuSheet from "./ListMenuSheet";
import { CircleBackButton } from "../../components/CircleButton";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import PosterImage from "../../components/PosterImage";
import SkeletonLine from "../../components/SkeletonLine";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useTitleInfo } from "../../hooks";
import { tmdbBlurredBackdropUri, tmdbPosterUri } from "../../hooks/useTmdbImage";
import { BLUR_RADIUS } from "./styles";
import { listStyles as card } from "../CalendarScreen/listStyles";
import { pickListsFile, shareListsExport } from "../../services/customListsFiles";
import {
	describeImport,
	listCoverItem,
	moveElement,
	parseListsExport,
	titleCount,
	type ImportPlan,
} from "../../utils";
import { colors, fonts, spacing, typography } from "../../theme";

type Nav = NativeStackNavigationProp<ProfileStackParamList, Route.LISTS>;

const MODAL_HANDOFF_MS = 350;
/** Press and hold this long to pick a list up */
const HOLD_TO_DRAG_MS = 250;
/** The fade under the title bar — and the space above the first card */
const FADE_HEIGHT = spacing.lg;
/** Page colour → transparent: the fade under the title bar */
const TOP_FADE = [colors.background, "rgba(0, 0, 0, 0)"] as const;
/** The drag pan wakes this long after the row's long press has fired */
const PAN_WAKE_AFTER_MS = 50;
/** A drop waits this long for another before the order is written */
const AUTOSAVE_MS = 800;
/** Same row metrics as the Add to List drawer */
const MENU_SIZE = 30;

const NAME_ERRORS = {
	taken: "You already have a list with that name.",
	limit: "You've reached the maximum number of lists.",
	failed: "Couldn't save the list. Check your connection and try again.",
	empty: "Give the list a name.",
} as const;

const IMPORT_ERRORS = {
	invalid: "That file isn't a Watchloom lists export.",
	newer: "That file was made by a newer version of the app. Update the app and try again.",
	empty: "That file doesn't contain any lists.",
	too_large: "That file is too large to be a lists export.",
	unreadable: "Couldn't read that file.",
} as const;

interface RowProps {
	list: CustomList;
	onOpen: () => void;
	onMenu: () => void;
}

/** Slots in a card's strip, under the name: posters, the last one a "+N" tile when more are left */
const STRIP_SLOTS = 5;
/** Backdrop / poster wash fade in instead of popping */
const IMAGE_FADE_MS = 200;
/** A poster standing in for a missing backdrop: blurred to a wash of its colours */
const POSTER_BLUR_RADIUS = 30;
/** Taller than any card — the loading shimmer fills the whole card behind the overlay */
const CARD_FILL = 400;

/** "+N" for the strip's last tile; capped so it always fits */
const moreLabel = (n: number) => (n > 99 ? "99+" : `+${n}`);
/** One digit reads big; two or "99+" step down to fit the tile's width */
const moreFontSize = (n: number) => (n < 10 ? 17 : n < 100 ? 13 : 11);

/**
 * A list's first posters. Up to STRIP_SLOTS fit as they are; more → the last slot becomes "+N",
 * the next poster dimmed under it so it reads as more of the same (a "+1" would waste the slot)
 */
function PosterStrip({ items }: { items: CustomList["items"] }) {
	const overflow = items.length > STRIP_SLOTS;
	const shown = items.slice(0, overflow ? STRIP_SLOTS - 1 : STRIP_SLOTS);
	const next = overflow ? items[STRIP_SLOTS - 1] : null;
	return (
		<View style={styles.strip}>
			{shown.map((item) => (
				<PosterImage
					key={`${item.mediaType}_${item.tmdbId}`}
					posterPath={item.posterPath}
					mediaType={item.mediaType}
					style={styles.stripPoster}
				/>
			))}
			{next && (
				<View
					style={[styles.stripPoster, styles.moreBase]}
					accessible
					accessibilityLabel={`${items.length - shown.length} more`}
				>
					{/* Dimmed by its own opacity over black: an overlay on top lost to the image on Android */}
					<PosterImage
						posterPath={next.posterPath}
						mediaType={next.mediaType}
						style={[StyleSheet.absoluteFill, styles.morePoster]}
					/>
					<View style={[StyleSheet.absoluteFill, styles.moreTile]}>
						{/* Steps down per digit so +9 … +99 fit the 28px tile; past that, 99+ */}
						<Text
							style={[styles.moreText, { fontSize: moreFontSize(items.length - shown.length) }]}
							numberOfLines={1}
						>
							{moreLabel(items.length - shown.length)}
						</Text>
					</View>
				</View>
			)}
		</View>
	);
}

/**
 * One list as a calendar card (like a list's own List view): its cover title's backdrop blurred
 * under the dark overlay, the name over a strip of its first posters, the calendar square holding
 * the title count, ⋮ for its menu. Tap opens it; press and hold picks it up to drag (the library
 * starts a drag from a long press — a handle that starts it on first touch takes the touch away
 * from the list's own gesture).
 */
function ListRow({ list, onOpen, onMenu }: Readonly<RowProps>) {
	const drag = useReorderableDrag();
	// Picked up: the hold has registered and the drag is armed — a tick, and the card lifts
	// (a touch bigger, a soft light shadow-glow) until the finger lets go, so it's plain when it's ready to move
	const [lifted, setLifted] = useState(false);
	// The library's own start / end of this card's drag (UI thread → hop to JS)
	const liftUp = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
		setLifted(true);
	};
	useReorderableDragStart(() => {
		"worklet";
		runOnJS(liftUp)();
	});
	useReorderableDragEnd(() => {
		"worklet";
		runOnJS(setLifted)(false);
	});
	// The drag-end hook can be missed (a hold released before the drag settles); leaving the screen
	// must never leave the card lifted with its glow
	useFocusEffect(useCallback(() => () => setLifted(false), []));
	const cover = listCoverItem(list);
	const { data: info, isPending } = useTitleInfo(
		cover?.tmdbId ?? 0,
		cover?.mediaType ?? MediaType.TV,
		!!cover,
	);
	const loading = !!cover && isPending;
	return (
		<Pressable
			style={({ pressed }) => [
				card.episodeCard,
				styles.card,
				pressed && !lifted && styles.rowPressed,
				lifted && styles.rowLifted,
			]}
			onPress={() => {
				setLifted(false);
				onOpen();
			}}
			onLongPress={drag}
			delayLongPress={HOLD_TO_DRAG_MS}
			accessibilityRole="button"
			accessibilityLabel={`${list.name}, ${titleCount(list.items.length)}`}
			accessibilityHint="Press and hold to move"
		>
			{info?.backdropPath ? (
				<Image
					source={{ uri: tmdbBlurredBackdropUri(info.backdropPath) }}
					recyclingKey={list.id}
					style={StyleSheet.absoluteFill}
					contentFit="cover"
					contentPosition="top"
					blurRadius={BLUR_RADIUS}
					transition={IMAGE_FADE_MS}
				/>
			) : info && cover?.posterPath ? (
				<Image
					source={{ uri: tmdbPosterUri(cover.posterPath, 185) }}
					recyclingKey={`${list.id}_poster`}
					style={StyleSheet.absoluteFill}
					contentFit="cover"
					blurRadius={POSTER_BLUR_RADIUS}
					transition={IMAGE_FADE_MS}
				/>
			) : loading ? (
				<SkeletonLine width="100%" height={CARD_FILL} style={styles.skeletonCard} />
			) : null}
			{cover && <View style={[StyleSheet.absoluteFill, card.cardOverlay]} />}
			{lifted && <View style={[StyleSheet.absoluteFill, styles.liftedRim]} pointerEvents="none" />}
			<View style={card.epInfo}>
				{/* ⋮ rides the name line: it belongs to the list, and lines up card to card */}
				<View style={styles.nameRow}>
					<Text style={styles.cardName} numberOfLines={1}>
						{list.name}
					</Text>
					<Pressable
						onPress={onMenu}
						hitSlop={10}
						style={({ pressed }) => [styles.menuButton, pressed && styles.menuPressed]}
						accessibilityRole="button"
						accessibilityLabel={`Options for ${list.name}`}
					>
						<Ionicons name="ellipsis-vertical" size={20} color={colors.text} />
					</Pressable>
				</View>
				{list.items.length > 0 ? (
					<PosterStrip items={list.items} />
				) : (
					<Text style={styles.emptyLine}>Nothing here yet</Text>
				)}
			</View>
			<View style={card.epSquare}>
				<Text style={card.epSquareTitle}>{list.items.length === 1 ? "TITLE" : "TITLES"}</Text>
				<View style={card.epSquareRule} />
				<Text
					style={[card.epSquareValue, styles.squareValue]}
					numberOfLines={1}
					adjustsFontSizeToFit
				>
					{list.items.length}
				</Text>
			</View>
		</Pressable>
	);
}

/** Manage every list: reorder (saves itself), import, export, create */
export default function ListsScreen() {
	const navigation = useNavigation<Nav>();
	const { top } = useSafeAreaInsets();
	const user = useAuthStore((s) => s.user);
	const {
		lists,
		loading,
		createList,
		renameList,
		deleteList,
		reorderLists,
		planImport,
		applyImport,
	} = useCustomLists(user?.uid);

	// Dragging edits a list of ids; null = follow the saved order
	const [draftIds, setDraftIds] = useState<string[] | null>(null);
	// Latest draft for the save timer / unmount flush (state would be stale there)
	const draftRef = useRef<string[] | null>(null);
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const shown = useMemo(() => {
		if (!draftIds) return lists;
		const byId = new Map(lists.map((l) => [l.id, l]));
		const ordered = draftIds.map((id) => byId.get(id)).filter((l): l is CustomList => !!l);
		// A list made meanwhile (not in the draft) goes last
		return [...ordered, ...lists.filter((l) => !draftIds.includes(l.id))];
	}, [lists, draftIds]);

	const [naming, setNaming] = useState<"new" | CustomList | null>(null);
	const [nameError, setNameError] = useState<string | null>(null);
	const [nameBusy, setNameBusy] = useState(false);
	const [menuList, setMenuList] = useState<CustomList | null>(null);
	// Import / export, behind the top bar's ⋮
	const [pageMenuOpen, setPageMenuOpen] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<CustomList | null>(null);
	const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
	const [importing, setImporting] = useState(false);

	const goBack = () => navigation.goBack();
	const swipeBack = useSwipeBackPop(navigation);
	// The list's drag pan wakes only after the hold that picks a row up, so a sideways swipe reaches
	// the swipe-back. It must wake a beat *after* the row's long press (the library's advice): with
	// both at the same delay it was a coin-flip which fired first, and drags mostly didn't start
	const dragPan = useMemo(
		() => Gesture.Pan().activateAfterLongPress(HOLD_TO_DRAG_MS + PAN_WAKE_AFTER_MS),
		[],
	);
	const afterModalClose = (fn: () => void) => setTimeout(fn, MODAL_HANDOFF_MS);

	// Autosave: drops settle for AUTOSAVE_MS before the order is written, so a few drags in a row
	// are one write; leaving the page writes whatever is still waiting
	const save = async () => {
		if (saveTimer.current) clearTimeout(saveTimer.current);
		saveTimer.current = null;
		const ids = draftRef.current;
		if (!ids) return;
		const ok = await reorderLists(ids);
		// A newer drag since → that one saves next; keep showing it
		if (draftRef.current !== ids) return;
		draftRef.current = null;
		setDraftIds(null);
		if (!ok) Alert.alert("Couldn't save the order", "Check your connection and try again.");
	};
	const saveRef = useRef(save);
	saveRef.current = save;
	useEffect(() => () => void saveRef.current(), []);

	// Works from the latest draft (not this render's `shown`): the library follows a drop with a second
	// event (from -1) that must not undo it — moveElement ignores indexes outside the list
	const onReorder = ({ from, to }: ReorderableListReorderEvent) => {
		const prev = draftRef.current ?? shown.map((l) => l.id);
		const next = moveElement(prev, from, to);
		if (next === prev) return;
		draftRef.current = next;
		setDraftIds(next);
		if (saveTimer.current) clearTimeout(saveTimer.current);
		saveTimer.current = setTimeout(() => void saveRef.current(), AUTOSAVE_MS);
	};

	const submitName = async (name: string) => {
		if (!naming) return;
		setNameBusy(true);
		let error: string | null = null;
		if (naming === "new") {
			const result = await createList(name);
			if (!result.ok) error = NAME_ERRORS[result.reason];
		} else {
			const result = await renameList(naming.id, name);
			if (result !== "ok") error = NAME_ERRORS[result];
		}
		setNameBusy(false);
		if (error) setNameError(error);
		else {
			setNaming(null);
			setNameError(null);
		}
	};

	const exportLists = (which: CustomList[]) => {
		shareListsExport(which).catch((e: Error) => Alert.alert("Export failed", e.message));
	};

	const startImport = async () => {
		const picked = await pickListsFile();
		if (!picked.ok) {
			if (picked.reason !== "canceled") Alert.alert("Import failed", IMPORT_ERRORS[picked.reason]);
			return;
		}
		const parsed = parseListsExport(picked.text);
		if (!parsed.ok) {
			Alert.alert("Import failed", IMPORT_ERRORS[parsed.reason]);
			return;
		}
		const plan = planImport(parsed.lists);
		if (plan.titlesAdded === 0 && plan.listsCreated === 0) {
			Alert.alert("Nothing to import", "Everything in that file is already in your lists.");
			return;
		}
		setImportPlan(plan);
	};

	const confirmImport = async () => {
		if (!importPlan) return;
		setImporting(true);
		const ok = await applyImport(importPlan);
		setImporting(false);
		const plan = importPlan;
		setImportPlan(null);
		afterModalClose(() =>
			ok
				? Alert.alert("Import complete", describeImport(plan))
				: Alert.alert("Import failed", "Check your connection and try again."),
		);
	};

	return (
		// Swipe right from anywhere slides the page off, back to the profile (as on a list's page)
		<SwipeBackView onBack={goBack} {...swipeBack} style={styles.container}>
			<View style={[styles.topBar, { paddingTop: top + 8 }]}>
				<CircleBackButton tone={CircleButtonTone.SURFACE_LIGHT} onPress={goBack} />
				<Text style={styles.title}>Lists</Text>
				<TouchableOpacity
					onPress={() => {
						setNameError(null);
						setNaming("new");
					}}
					hitSlop={8}
					accessibilityLabel="New list"
				>
					<Ionicons name="add-circle-outline" size={26} color={colors.text} />
				</TouchableOpacity>
				<TouchableOpacity
					onPress={() => setPageMenuOpen(true)}
					hitSlop={8}
					accessibilityLabel="More list options"
				>
					<Ionicons name="ellipsis-vertical" size={24} color={colors.text} />
				</TouchableOpacity>
			</View>
			{/* Fixed under the title (not in the scroll, where the fade would hide it): the count, and
			    what holding a card does */}
			{lists.length > 0 && (
				<Text style={styles.hint}>
					{lists.length === 1 ? "1 list" : `${lists.length} lists · hold one to reorder`}
				</Text>
			)}

			{loading && lists.length === 0 ? null : lists.length === 0 ? (
				<View style={styles.empty}>
					<Ionicons name="bookmarks-outline" size={40} color={colors.textMuted} />
					<Text style={styles.emptyTitle}>No lists yet</Text>
					<Text style={styles.emptyHint}>
						Create one with the + button, or import a list someone shared with you.
					</Text>
				</View>
			) : (
				<View style={styles.listArea}>
					<ReorderableList
						data={shown}
						panGesture={dragPan}
						// The library also asks about the slot just past the end while a drag settles: no list there
						keyExtractor={(l, index) => (l ? l.id : `slot_${index}`)}
						onReorder={onReorder}
						contentContainerStyle={styles.listContent}
						renderItem={({ item }) =>
							item ? (
								<ListRow
									list={item}
									onOpen={() => navigation.navigate(Route.LIST_DETAIL, { listId: item.id })}
									onMenu={() => setMenuList(item)}
								/>
							) : null
						}
					/>
					{/* Cards fade out under the title bar instead of being cut at its edge */}
					<LinearGradient colors={TOP_FADE} style={styles.topFade} pointerEvents="none" />
				</View>
			)}

			<BottomSheet visible={pageMenuOpen} onClose={() => setPageMenuOpen(false)}>
				{(close) => (
					<SheetGroup>
						<SheetOption
							icon="download-outline"
							color={colors.accent}
							title="Import lists"
							hint="From a file someone shared with you"
							onPress={() => close(() => void startImport())}
						/>
						{lists.length > 0 && (
							<SheetOption
								icon="share-outline"
								color={colors.accent}
								title="Export all lists"
								hint="As one file you can share or keep"
								onPress={() => close(() => exportLists(lists))}
							/>
						)}
					</SheetGroup>
				)}
			</BottomSheet>

			<ListMenuSheet
				list={menuList}
				// Another popup only once the sheet's own modal is gone (iOS can't stack them mid-dismiss)
				onRename={(target) =>
					afterModalClose(() => {
						setNameError(null);
						setNaming(target);
					})
				}
				onShare={(target) => exportLists([target])}
				onDelete={(target) => afterModalClose(() => setDeleteTarget(target))}
				onClose={() => setMenuList(null)}
			/>

			<ListNameModal
				visible={naming !== null}
				title={naming === "new" ? NEW_LIST_TITLE : "Rename List"}
				image={
					naming === "new" ? <ModalArt source={NEW_LIST_ART} ratio={NEW_LIST_RATIO} /> : undefined
				}
				hint={naming === "new" ? NEW_LIST_HINTS : undefined}
				initialName={naming && naming !== "new" ? naming.name : ""}
				confirmLabel={naming === "new" ? "Create" : "Save"}
				error={nameError}
				loading={nameBusy}
				onSubmit={submitName}
				onClose={() => {
					setNaming(null);
					setNameError(null);
				}}
			/>

			<ConfirmModal
				visible={!!deleteTarget}
				title="Delete List?"
				hint={`"${deleteTarget?.name ?? ""}" will be deleted. The shows and movies in it aren't affected — your watchlist and history stay as they are.`}
				confirmLabel="Delete"
				onConfirm={() => {
					if (deleteTarget) deleteList(deleteTarget.id);
					setDeleteTarget(null);
				}}
				onClose={() => setDeleteTarget(null)}
			/>

			<ConfirmModal
				visible={!!importPlan}
				title="Import Lists?"
				hint={
					importPlan ? `This will make these changes: ${describeImport(importPlan)}` : undefined
				}
				confirmLabel="Import"
				confirmColor={colors.primary}
				loading={importing}
				onConfirm={confirmImport}
				onClose={() => setImportPlan(null)}
			/>
		</SwipeBackView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.background },
	topBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.lg,
		paddingHorizontal: spacing.lg,
		paddingBottom: spacing.md,
	},
	title: { flex: 1, fontSize: 20, fontWeight: "700", color: colors.text },
	listArea: { flex: 1 },
	topFade: { position: "absolute", top: 0, left: 0, right: 0, height: FADE_HEIGHT },
	// Top: the fade's height, so the first card rests clear of it and only fades once scrolled
	listContent: {
		paddingHorizontal: spacing.lg,
		paddingTop: FADE_HEIGHT,
		paddingBottom: spacing.xxl * 2,
	},
	// Left, in line with the cards' edge, like a list page's count line
	hint: {
		...typography.caption,
		color: colors.textSecondary,
		paddingHorizontal: spacing.lg,
		marginTop: -spacing.xs,
	},
	// Flat, like the drawer's rows; the page colour behind it so a picked-up row covers the others
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingVertical: spacing.sm,
		backgroundColor: colors.background,
	},
	rowPressed: { transform: [{ scale: 0.98 }] },
	// Armed to drag: lifted, with a soft shadow glow under it
	rowLifted: {
		transform: [{ scale: 1.03 }],
		// A light halo (a dark shadow would vanish on the black page). No `elevation`: Android paints
		// that shadow under the card's own body, which showed as a black rectangle in the middle
		shadowColor: colors.text,
		shadowOpacity: 0.45,
		shadowRadius: 22,
		shadowOffset: { width: 0, height: 0 },
	},
	// Lifted card's glow on Android (no elevation shadow): a soft light rim just inside the edge
	liftedRim: {
		borderRadius: 16,
		borderWidth: 2,
		borderColor: "rgba(255, 255, 255, 0.35)",
	},
	// The calendar card sits in the list's own padding
	card: { marginHorizontal: 0 },
	skeletonCard: { position: "absolute", top: 0, left: 0, borderRadius: 0 },
	nameRow: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "stretch",
		marginBottom: spacing.sm,
	},
	cardName: { ...typography.subtitle, fontSize: 18, flex: 1 },
	strip: { flexDirection: "row", gap: spacing.xs },
	stripPoster: { width: 28, height: 42, borderRadius: 4, overflow: "hidden" },
	// Dims the poster under "+N"; a hairline keeps the tile's edge against dark posters
	moreBase: { backgroundColor: colors.background },
	morePoster: { opacity: 0.4 },
	moreTile: {
		borderRadius: 4,
		borderWidth: StyleSheet.hairlineWidth * 2,
		borderColor: "rgba(255, 255, 255, 0.18)",
		alignItems: "center",
		justifyContent: "center",
	},
	// The count square's face, so the number reads as part of the same card
	moreText: {
		fontFamily: fonts.smoochMedium,
		color: colors.text,
		letterSpacing: 0.5,
		includeFontPadding: false,
	},
	emptyLine: { ...typography.caption, color: colors.textSecondary },
	squareValue: { fontSize: 44, lineHeight: 48 },
	rowText: { flex: 1, minWidth: 0 },
	rowName: { ...typography.subtitle, fontSize: 16 },
	rowCount: { ...typography.caption, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
	// Bare dots in a badge-sized tap area (no ring)
	menuButton: {
		width: MENU_SIZE,
		height: MENU_SIZE,
		alignItems: "center",
		justifyContent: "center",
	},
	menuPressed: { opacity: 0.5 },
	empty: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xxl,
		paddingBottom: 120,
		gap: spacing.sm,
	},
	emptyTitle: { ...typography.subtitle, fontSize: 18 },
	emptyHint: { ...typography.caption, textAlign: "center" },
});
