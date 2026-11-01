import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ReorderableList, {
	useReorderableDrag,
	type ReorderableListReorderEvent,
} from "react-native-reorderable-list";
import { useAuthStore } from "../../stores";
import { useCustomLists } from "../../hooks";
import { CircleButtonTone, NEW_LIST_HINTS, NEW_LIST_TITLE, Route } from "../../enums";
import type { CustomList, ProfileStackParamList } from "../../types";
import { ConfirmModal, ListNameModal, OptionsSheet } from "../../components";
import { ModalArt, NEW_LIST_ART, NEW_LIST_RATIO } from "../../components/modals/ModalArt";
import { CircleBackButton } from "../../components/CircleButton";
import { pickListsFile, shareListsExport } from "../../services/customListsFiles";
import {
	describeImport,
	moveElement,
	parseListsExport,
	sameIdOrder,
	titleCount,
	type ImportPlan,
} from "../../utils";
import { colors, spacing, typography } from "../../theme";

type Nav = NativeStackNavigationProp<ProfileStackParamList, Route.LISTS>;

const MODAL_HANDOFF_MS = 350;

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
 * One list: tap to open; press and hold anywhere on the row (the ≡ handle shows where) to pick it up
 * and drag; ⋯ opens its menu. The library starts a drag from a long press — a handle that starts it
 * on first touch (onPressIn) takes the touch away from the list's own gesture.
 */
function ListRow({ list, onOpen, onMenu }: Readonly<RowProps>) {
	const drag = useReorderableDrag();
	return (
		<TouchableOpacity
			style={styles.row}
			onPress={onOpen}
			onLongPress={drag}
			delayLongPress={250}
			activeOpacity={0.8}
		>
			<View style={styles.handle} accessibilityLabel={`Press and hold to move ${list.name}`}>
				<Ionicons name="reorder-three" size={26} color={colors.textMuted} />
			</View>
			<View style={styles.rowText}>
				<Text style={styles.rowName} numberOfLines={1}>
					{list.name}
				</Text>
				<Text style={styles.rowCount}>{titleCount(list.items.length)}</Text>
			</View>
			<TouchableOpacity
				onPress={onMenu}
				hitSlop={10}
				style={styles.menuButton}
				accessibilityLabel={`Options for ${list.name}`}
			>
				<Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
			</TouchableOpacity>
			<Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={styles.chevron} />
		</TouchableOpacity>
	);
}

/** Manage every list: reorder (✓ saves — it's the order of the profile page), import, export, create */
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
	const [saving, setSaving] = useState(false);
	const shown = useMemo(() => {
		if (!draftIds) return lists;
		const byId = new Map(lists.map((l) => [l.id, l]));
		const ordered = draftIds.map((id) => byId.get(id)).filter((l): l is CustomList => !!l);
		// A list made meanwhile (not in the draft) goes last
		return [...ordered, ...lists.filter((l) => !draftIds.includes(l.id))];
	}, [lists, draftIds]);
	const dirty = draftIds !== null && !sameIdOrder(shown, lists);

	const [naming, setNaming] = useState<"new" | CustomList | null>(null);
	const [nameError, setNameError] = useState<string | null>(null);
	const [nameBusy, setNameBusy] = useState(false);
	const [menuList, setMenuList] = useState<CustomList | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<CustomList | null>(null);
	const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
	const [importing, setImporting] = useState(false);

	const goBack = () => navigation.goBack();
	const afterModalClose = (fn: () => void) => setTimeout(fn, MODAL_HANDOFF_MS);

	// Works from the latest draft (not this render's `shown`): the library follows a drop with a second
	// event (from -1) that must not undo it — moveElement ignores indexes outside the list
	const onReorder = ({ from, to }: ReorderableListReorderEvent) =>
		setDraftIds((prev) => moveElement(prev ?? lists.map((l) => l.id), from, to));

	const save = async () => {
		if (!dirty || saving) return;
		setSaving(true);
		const ok = await reorderLists(shown.map((l) => l.id));
		setSaving(false);
		if (ok) setDraftIds(null);
		else Alert.alert("Couldn't save the order", "Check your connection and try again.");
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
		<View style={styles.container}>
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
				<TouchableOpacity
					onPress={save}
					disabled={!dirty || saving}
					hitSlop={8}
					accessibilityLabel="Save order"
				>
					<Ionicons name="checkmark" size={30} color={dirty ? colors.accent : colors.textMuted} />
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

			<OptionsSheet
				visible={!!menuList}
				title={menuList?.name ?? ""}
				subtitle={menuList ? titleCount(menuList.items.length) : undefined}
				options={
					menuList
						? [
								{
									key: "export",
									label: "Export list",
									icon: "share-outline",
									onPress: () => exportLists([menuList]),
								},
								{
									key: "rename",
									label: "Rename list",
									icon: "create-outline",
									onPress: () => {
										const target = menuList;
										afterModalClose(() => {
											setNameError(null);
											setNaming(target);
										});
									},
								},
								{
									key: "delete",
									label: "Delete list",
									icon: "trash-outline",
									destructive: true,
									onPress: () => {
										const target = menuList;
										afterModalClose(() => setDeleteTarget(target));
									},
								},
							]
						: []
				}
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
		</View>
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
	row: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: colors.surface,
		borderRadius: 12,
		marginBottom: spacing.sm,
	},
	handle: { paddingLeft: spacing.md, paddingRight: spacing.sm, paddingVertical: spacing.lg },
	rowText: { flex: 1, marginRight: spacing.sm, paddingVertical: spacing.md },
	menuButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
	chevron: { marginRight: spacing.md },
	rowName: { ...typography.subtitle, fontSize: 15 },
	rowCount: { ...typography.caption, marginTop: 2 },
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
