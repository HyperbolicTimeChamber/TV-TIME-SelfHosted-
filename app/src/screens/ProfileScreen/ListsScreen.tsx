import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Gesture } from "react-native-gesture-handler";
import ReorderableList, {
	useReorderableDrag,
	type ReorderableListReorderEvent,
} from "react-native-reorderable-list";
import { useAuthStore } from "../../stores";
import { useCustomLists } from "../../hooks";
import { CircleButtonTone, NEW_LIST_HINTS, NEW_LIST_TITLE, Route } from "../../enums";
import type { CustomList, ProfileStackParamList } from "../../types";
import { ConfirmModal, ListNameModal } from "../../components";
import BottomSheet, { SheetGroup, SheetOption } from "../../components/modals/BottomSheet";
import { ModalArt, NEW_LIST_ART, NEW_LIST_RATIO } from "../../components/modals/ModalArt";
import { CircleBackButton } from "../../components/CircleButton";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import PosterImage from "../../components/PosterImage";
import { pickListsFile, shareListsExport } from "../../services/customListsFiles";
import {
	describeImport,
	listCoverItem,
	moveElement,
	parseListsExport,
	titleCount,
	type ImportPlan,
} from "../../utils";
import { colors, spacing, typography } from "../../theme";

type Nav = NativeStackNavigationProp<ProfileStackParamList, Route.LISTS>;

const MODAL_HANDOFF_MS = 350;
/** Press and hold this long to pick a list up */
const HOLD_TO_DRAG_MS = 250;
/** A drop waits this long for another before the order is written */
const AUTOSAVE_MS = 800;
/** Same row metrics as the Add to List drawer */
const COVER_SIZE = 52;
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

/**
 * One list, laid out like the Add to List drawer's rows: cover (the title added last), name + count,
 * ⋯ for its menu. Tap opens it; press and hold anywhere on the row picks it up to drag
 * (the library starts a drag from a long press — a handle that starts it on first touch takes the
 * touch away from the list's own gesture).
 */
function ListRow({ list, onOpen, onMenu }: Readonly<RowProps>) {
	const drag = useReorderableDrag();
	return (
		<Pressable
			style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
			onPress={onOpen}
			onLongPress={drag}
			delayLongPress={HOLD_TO_DRAG_MS}
			accessibilityRole="button"
			accessibilityLabel={`${list.name}, ${titleCount(list.items.length)}`}
			accessibilityHint="Press and hold to move"
		>
			<ListCover list={list} />
			<View style={styles.rowText}>
				<Text style={styles.rowName} numberOfLines={1}>
					{list.name}
				</Text>
				<Text style={styles.rowCount}>{titleCount(list.items.length)}</Text>
			</View>
			<Pressable
				onPress={onMenu}
				hitSlop={10}
				style={({ pressed }) => [styles.menuButton, pressed && styles.menuPressed]}
				accessibilityRole="button"
				accessibilityLabel={`Options for ${list.name}`}
			>
				<Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
			</Pressable>
		</Pressable>
	);
}

/** A list's cover: the title added last, or a list icon when it's empty */
function ListCover({ list }: { list: CustomList }) {
	const cover = listCoverItem(list);
	return cover ? (
		<PosterImage posterPath={cover.posterPath} mediaType={cover.mediaType} style={styles.cover} />
	) : (
		<View style={[styles.cover, styles.coverEmpty]}>
			<Ionicons name="list" size={22} color={colors.textMuted} />
		</View>
	);
}

/**
 * A list's menu, in the app's sheet style: the list itself on top (cover, name, count — as in its
 * row), rename / share grouped, delete on its own. Each action runs once the sheet has slid away.
 */
function ListMenuSheet({
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
		<BottomSheet visible={!!list} onClose={onClose}>
			{(close) =>
				list && (
					<>
						<View style={styles.menuHeader}>
							<ListCover list={list} />
							<View style={styles.rowText}>
								<Text style={styles.rowName} numberOfLines={1}>
									{list.name}
								</Text>
								<Text style={styles.rowCount}>{titleCount(list.items.length)}</Text>
							</View>
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
						<View style={styles.menuGap} />
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
	const [deleteTarget, setDeleteTarget] = useState<CustomList | null>(null);
	const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
	const [importing, setImporting] = useState(false);

	const goBack = () => navigation.goBack();
	const swipeBack = useSwipeBackPop(navigation);
	// The list's drag pan only wakes after the hold that picks a row up — awake from the first touch
	// it claimed every move, so a sideways swipe never reached the swipe-back
	const dragPan = useMemo(() => Gesture.Pan().activateAfterLongPress(HOLD_TO_DRAG_MS), []);
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
				<TouchableOpacity onPress={startImport} hitSlop={8} accessibilityLabel="Import list">
					<Ionicons name="download-outline" size={25} color={colors.text} />
				</TouchableOpacity>
				<TouchableOpacity
					onPress={() => exportLists(lists)}
					disabled={lists.length === 0}
					hitSlop={8}
					accessibilityLabel="Export all lists"
				>
					<Ionicons
						name="share-outline"
						size={25}
						color={lists.length === 0 ? colors.textMuted : colors.text}
					/>
				</TouchableOpacity>
			</View>

			{loading && lists.length === 0 ? null : lists.length === 0 ? (
				<View style={styles.empty}>
					<Ionicons name="bookmarks-outline" size={40} color={colors.textMuted} />
					<Text style={styles.emptyTitle}>No lists yet</Text>
					<Text style={styles.emptyHint}>
						Create one with the + button, or import a list someone shared with you.
					</Text>
				</View>
			) : (
				<ReorderableList
					data={shown}
					panGesture={dragPan}
					ListHeaderComponent={
						lists.length > 1 ? (
							<Text style={styles.hint}>Hold a list to drag it into place</Text>
						) : null
					}
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
			)}

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
	listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 2 },
	hint: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
	// Flat, like the drawer's rows; the page colour behind it so a picked-up row covers the others
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingVertical: spacing.sm,
		backgroundColor: colors.background,
	},
	rowPressed: { transform: [{ scale: 0.98 }] },
	cover: { width: COVER_SIZE, height: COVER_SIZE, borderRadius: 10, overflow: "hidden" },
	coverEmpty: {
		backgroundColor: colors.surfaceLight,
		alignItems: "center",
		justifyContent: "center",
	},
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
	menuHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		marginBottom: spacing.lg,
	},
	menuGap: { height: spacing.md },
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
