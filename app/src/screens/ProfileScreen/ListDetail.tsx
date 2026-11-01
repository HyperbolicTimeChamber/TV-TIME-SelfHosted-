import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
	View,
	Text,
	FlatList,
	TouchableOpacity,
	StyleSheet,
	Alert,
	useWindowDimensions,
} from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ReorderableList, { type ReorderableListReorderEvent } from "react-native-reorderable-list";
import { useAuthStore } from "../../stores";
import { useCustomLists, useCustomListView } from "../../hooks";
import { CircleButtonTone, CustomListView, Route } from "../../enums";
import type { CustomListItem, ProfileStackParamList } from "../../types";
import { AddToListSheet, ConfirmModal, ListNameModal } from "../../components";
import type { ShowDrawerAction } from "../../components/ShowDrawer";
import CircleButton, { CircleBackButton } from "../../components/CircleButton";
import PosterImage from "../../components/PosterImage";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import { shareListsExport } from "../../services/customListsFiles";
import { moveElement, sameItemOrder, titleCount } from "../../utils";
import { colors, spacing, typography } from "../../theme";
import { ListItemPreview, ListRow, ReorderRow } from "./ListItemViews";

type Nav = NativeStackNavigationProp<ProfileStackParamList, Route.LIST_DETAIL>;

const COLUMNS = 3;
/** A drawer / sheet is closing under the next one: wait so iOS never sees two modals at once */
const MODAL_HANDOFF_MS = 350;

const RENAME_ERRORS = {
	taken: "You already have a list with that name.",
	empty: "Give the list a name.",
	failed: "Couldn't rename the list. Check your connection and try again.",
} as const;

/**
 * One custom list. Grid or List view; long-press a title for its preview card (+ add to another
 * list / remove / export); the reorder button switches to pick-up-and-drop mode.
 */
export default function ListDetailScreen() {
	const navigation = useNavigation<Nav>();
	const swipeBack = useSwipeBackPop(navigation);
	const { listId } = useRoute<RouteProp<ProfileStackParamList, Route.LIST_DETAIL>>().params;
	const { top } = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const user = useAuthStore((s) => s.user);
	const { lists, loading, renameList, deleteList, removeFromList, reorderItems } = useCustomLists(
		user?.uid,
	);
	const list = lists.find((l) => l.id === listId);
	const [view, setView] = useCustomListView();

	const [renaming, setRenaming] = useState(false);
	const [renameError, setRenameError] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [previewItem, setPreviewItem] = useState<CustomListItem | null>(null);
	const [removeTarget, setRemoveTarget] = useState<CustomListItem | null>(null);
	const [listTarget, setListTarget] = useState<CustomListItem | null>(null);
	// Reorder mode edits a copy; ✓ saves it, ✕ drops it
	const [reordering, setReordering] = useState(false);
	const [draft, setDraft] = useState<CustomListItem[]>([]);
	const [saving, setSaving] = useState(false);

	const goBack = useCallback(() => navigation.goBack(), [navigation]);

	// Deleted (here or on another device): nothing left to show
	useEffect(() => {
		if (!loading && !list) goBack();
	}, [loading, list, goBack]);

	const posterWidth = useMemo(() => {
		const gap = spacing.sm * (COLUMNS - 1);
		return Math.floor((width - spacing.lg * 2 - gap) / COLUMNS);
	}, [width]);

	if (!list) return null;

	const dirty = reordering && !sameItemOrder(draft, list.items);
	const openTitle = (item: CustomListItem) =>
		navigation.navigate(Route.SHOW_DETAIL, { tmdbId: item.tmdbId, mediaType: item.mediaType });
	const afterModalClose = (fn: () => void) => setTimeout(fn, MODAL_HANDOFF_MS);

	const handleRename = async (name: string) => {
		const result = await renameList(listId, name);
		if (result === "ok") {
			setRenaming(false);
			setRenameError(null);
		} else {
			setRenameError(RENAME_ERRORS[result]);
		}
	};

	const startReorder = () => {
		setDraft(list.items);
		setReordering(true);
	};
	const saveReorder = async () => {
		if (!dirty || saving) return;
		setSaving(true);
		const ok = await reorderItems(listId, draft);
		setSaving(false);
		if (ok) setReordering(false);
		else Alert.alert("Couldn't save the order", "Check your connection and try again.");
	};
	const onReorder = ({ from, to }: ReorderableListReorderEvent) => {
		setDraft((d) => moveElement(d, from, to));
	};

	const exportList = () => {
		shareListsExport([list]).catch((e: Error) => Alert.alert("Export failed", e.message));
	};

	const previewActions: ShowDrawerAction[] = previewItem
		? [
				{
					key: "add",
					label: "Add to another list",
					icon: "bookmark-outline",
					onPress: () => {
						const item = previewItem;
						setPreviewItem(null);
						afterModalClose(() => setListTarget(item));
					},
				},
				{
					key: "remove",
					label: `Remove from ${list.name}`,
					icon: "trash-outline",
					destructive: true,
					onPress: () => {
						const item = previewItem;
						setPreviewItem(null);
						afterModalClose(() => setRemoveTarget(item));
					},
				},
				{
					key: "export",
					label: "Export list",
					icon: "share-outline",
					onPress: () => {
						setPreviewItem(null);
						afterModalClose(exportList);
					},
				},
			]
		: [];

	return (
		<SwipeBackView onBack={goBack} disabled={reordering} {...swipeBack} style={styles.container}>
			<View style={[styles.topBar, { paddingTop: top + 8 }]}>
				<CircleBackButton tone={CircleButtonTone.SURFACE_LIGHT} onPress={goBack} />
				<Text style={styles.title} numberOfLines={1}>
					{list.name}
				</Text>
				<CircleButton
					tone={CircleButtonTone.SURFACE_LIGHT}
					onPress={() => {
						setRenameError(null);
						setRenaming(true);
					}}
					accessibilityLabel="Rename list"
				>
					<Ionicons name="create-outline" size={22} color={colors.text} />
				</CircleButton>
				<CircleButton
					tone={CircleButtonTone.SURFACE_LIGHT}
					onPress={() => setConfirmDelete(true)}
					accessibilityLabel="Delete list"
				>
					<Ionicons name="trash-outline" size={22} color={colors.destructiveRed} />
				</CircleButton>
			</View>

			{reordering ? (
				<View style={styles.subBar}>
					<Text style={[styles.count, styles.countGrow]}>Press and hold a title, then drag it</Text>
					<TouchableOpacity
						onPress={() => setReordering(false)}
						hitSlop={8}
						accessibilityLabel="Cancel reordering"
					>
						<Ionicons name="close" size={26} color={colors.text} />
					</TouchableOpacity>
					<TouchableOpacity
						onPress={saveReorder}
						disabled={!dirty || saving}
						hitSlop={8}
						accessibilityLabel="Save order"
					>
						<Ionicons name="checkmark" size={28} color={dirty ? colors.accent : colors.textMuted} />
					</TouchableOpacity>
				</View>
			) : (
				<View style={styles.subBar}>
					<Text style={[styles.count, styles.countGrow]} numberOfLines={1}>
						{titleCount(list.items.length)} · long-press for options
					</Text>
					{list.items.length > 1 && (
						<TouchableOpacity onPress={startReorder} hitSlop={8} accessibilityLabel="Reorder titles">
							<Ionicons name="swap-vertical" size={24} color={colors.text} />
						</TouchableOpacity>
					)}
					<TouchableOpacity
						onPress={() => setView(view === CustomListView.GRID ? CustomListView.LIST : CustomListView.GRID)}
						hitSlop={8}
						accessibilityLabel={view === CustomListView.GRID ? "Show as list" : "Show as grid"}
					>
						<Ionicons
							name={view === CustomListView.GRID ? "list" : "grid"}
							size={22}
							color={colors.text}
						/>
					</TouchableOpacity>
				</View>
			)}

			{list.items.length === 0 ? (
				<View style={styles.empty}>
					<Ionicons name="bookmarks-outline" size={40} color={colors.textMuted} />
					<Text style={styles.emptyTitle}>This list is empty</Text>
					<Text style={styles.emptyHint}>
						Tap the bookmark on a show or movie to add it here.
					</Text>
				</View>
			) : reordering ? (
				<ReorderableList
					data={draft}
					// The library also asks about the slot just past the end while a drag settles: no item there
					keyExtractor={(item, index) => (item ? `${item.mediaType}_${item.tmdbId}` : `slot_${index}`)}
					onReorder={onReorder}
					renderItem={({ item }) => (item ? <ReorderRow item={item} /> : null)}
					contentContainerStyle={styles.reorderContent}
				/>
			) : view === CustomListView.GRID ? (
				<FlatList
					key="grid"
					data={list.items}
					keyExtractor={(item) => `${item.mediaType}_${item.tmdbId}`}
					numColumns={COLUMNS}
					columnWrapperStyle={styles.row}
					contentContainerStyle={styles.grid}
					renderItem={({ item }) => (
						<TouchableOpacity
							activeOpacity={0.7}
							onPress={() => openTitle(item)}
							onLongPress={() => setPreviewItem(item)}
							delayLongPress={350}
						>
							<PosterImage
								posterPath={item.posterPath}
								mediaType={item.mediaType}
								style={{ width: posterWidth, height: posterWidth * 1.5, borderRadius: 6 }}
								title={!item.posterPath ? item.title : undefined}
							/>
						</TouchableOpacity>
					)}
				/>
			) : (
				<FlatList
					key="list"
					data={list.items}
					keyExtractor={(item) => `${item.mediaType}_${item.tmdbId}`}
					contentContainerStyle={styles.listContent}
					renderItem={({ item }) => (
						<ListRow
							item={item}
							onPress={() => openTitle(item)}
							onLongPress={() => setPreviewItem(item)}
						/>
					)}
				/>
			)}

			<ListItemPreview
				item={previewItem}
				actions={previewActions}
				onGoToShow={(item) => {
					setPreviewItem(null);
					openTitle(item);
				}}
				onClose={() => setPreviewItem(null)}
			/>

			<AddToListSheet
				entry={
					listTarget
						? {
								tmdbId: listTarget.tmdbId,
								mediaType: listTarget.mediaType,
								title: listTarget.title,
								posterPath: listTarget.posterPath,
							}
						: null
				}
				onClose={() => setListTarget(null)}
			/>

			<ListNameModal
				visible={renaming}
				title="Rename List"
				initialName={list.name}
				error={renameError}
				onSubmit={handleRename}
				onClose={() => setRenaming(false)}
			/>

			<ConfirmModal
				visible={confirmDelete}
				title="Delete List?"
				hint={`"${list.name}" will be deleted. The shows and movies in it aren't affected — your watchlist and history stay as they are.`}
				confirmLabel="Delete"
				onConfirm={() => {
					setConfirmDelete(false);
					deleteList(listId);
				}}
				onClose={() => setConfirmDelete(false)}
			/>

			<ConfirmModal
				visible={!!removeTarget}
				title="Remove From List?"
				hint={`Remove "${removeTarget?.title ?? ""}" from "${list.name}"? It stays in your watchlist if it's there.`}
				confirmLabel="Remove"
				onConfirm={() => {
					if (removeTarget) removeFromList(listId, removeTarget.tmdbId, removeTarget.mediaType);
					setRemoveTarget(null);
				}}
				onClose={() => setRemoveTarget(null)}
			/>
		</SwipeBackView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.background },
	topBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingHorizontal: spacing.lg,
		paddingBottom: spacing.md,
		backgroundColor: colors.background,
	},
	title: { flex: 1, fontSize: 20, fontWeight: "700", color: colors.text },
	subBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.lg,
		paddingHorizontal: spacing.lg,
		paddingBottom: spacing.md,
	},
	count: { ...typography.caption },
	countGrow: { flex: 1 },
	grid: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 2 },
	row: { gap: spacing.sm, marginBottom: spacing.sm },
	listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 2 },
	reorderContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 2 },
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
