import React, { useCallback, useEffect, useState } from "react";
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
import { Image } from "expo-image";
import ReorderableList, { type ReorderableListReorderEvent } from "react-native-reorderable-list";
import { useAuthStore } from "../../stores";
import { useCustomLists, useCustomListView } from "../../hooks";
import { CircleButtonTone, CustomListView, Route } from "../../enums";
import { MediaType, type CustomListItem, type ProfileStackParamList } from "../../types";
import { AddToListSheet, ConfirmModal, ListNameModal } from "../../components";
import type { ShowDrawerAction } from "../../components/ShowDrawer";
import { CircleBackButton } from "../../components/CircleButton";
import ListMenuSheet from "./ListMenuSheet";
import { shareListsExport } from "../../services/customListsFiles";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import { moveElement, sameItemOrder, titleCount } from "../../utils";
import { colors, spacing, typography } from "../../theme";
import { ListGridCard, ListItemPreview, ListRow, ReorderRow } from "./ListItemViews";
import { useSearchActions } from "../SearchScreen/useSearchActions";
import SearchModals from "../SearchScreen/SearchModals";
import { styles as searchStyles } from "../SearchScreen/styles";

type Nav = NativeStackNavigationProp<ProfileStackParamList, Route.LIST_DETAIL>;

/** Grid view is Search's result grid */
const COLUMNS = 2;

/** Empty list art (transparent PNG, width / height) */
const EMPTY_ART = require("../../../assets/list-empty.png");
const EMPTY_ART_RATIO = 1300 / 1500;
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
	// Adding to / removing from the watchlist from a card: the same flow (and popups) as Search
	const actions = useSearchActions();

	const [renaming, setRenaming] = useState(false);
	const [renameError, setRenameError] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const [previewItem, setPreviewItem] = useState<CustomListItem | null>(null);
	const [removeTarget, setRemoveTarget] = useState<CustomListItem | null>(null);
	const [listTarget, setListTarget] = useState<CustomListItem | null>(null);
	// Reorder mode edits a copy; ✓ saves it, ✕ drops it
	const [reordering, setReordering] = useState(false);
	const [draft, setDraft] = useState<CustomListItem[]>([]);
	const [saving, setSaving] = useState(false);

	const goBack = useCallback(() => navigation.goBack(), [navigation]);
	// The root navigator owns the tabs (same hop the Watchlist's "Add Shows & Movies" makes)
	const goSearch = useCallback(
		() => (navigation as any).navigate(Route.SWIPE_TABS, { screen: Route.SEARCH }),
		[navigation],
	);

	// Deleted (here or on another device): nothing left to show
	useEffect(() => {
		if (!loading && !list) goBack();
	}, [loading, list, goBack]);

	const emptyArtWidth = Math.min(width * 0.6, 260);

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

	const previewActions: ShowDrawerAction[] = previewItem
		? [
				{
					key: "add",
					label: "Add to another list",
					hint: "Keep it here too",
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
					hint: "Only from this list",
					icon: "trash-outline",
					destructive: true,
					onPress: () => {
						const item = previewItem;
						setPreviewItem(null);
						afterModalClose(() => setRemoveTarget(item));
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
				{/* Rename / share / delete behind one ⋮, as on the Lists page */}
				<TouchableOpacity
					onPress={() => setMenuOpen(true)}
					hitSlop={8}
					accessibilityLabel="List options"
				>
					<Ionicons name="ellipsis-vertical" size={24} color={colors.text} />
				</TouchableOpacity>
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
						<TouchableOpacity
							onPress={startReorder}
							hitSlop={8}
							accessibilityLabel="Reorder titles"
						>
							<Ionicons name="swap-vertical" size={24} color={colors.text} />
						</TouchableOpacity>
					)}
					<TouchableOpacity
						onPress={() =>
							setView(view === CustomListView.GRID ? CustomListView.LIST : CustomListView.GRID)
						}
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
				// Anywhere in the empty area goes to Search (where the bookmark adds titles)
				<TouchableOpacity
					style={styles.empty}
					onPress={goSearch}
					activeOpacity={0.9}
					accessibilityRole="button"
					accessibilityLabel="List is empty. Go to Search"
				>
					<Image
						source={EMPTY_ART}
						style={{ width: emptyArtWidth, height: emptyArtWidth / EMPTY_ART_RATIO }}
						contentFit="contain"
					/>
					<Text style={styles.emptyText}>
						Zero items... I haven't felt this empty since my last fight.
					</Text>
				</TouchableOpacity>
			) : reordering ? (
				<ReorderableList
					data={draft}
					// The library also asks about the slot just past the end while a drag settles: no item there
					keyExtractor={(item, index) =>
						item ? `${item.mediaType}_${item.tmdbId}` : `slot_${index}`
					}
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
					columnWrapperStyle={searchStyles.row}
					contentContainerStyle={[searchStyles.grid, styles.gridContent]}
					renderItem={({ item }) => (
						<ListGridCard
							item={item}
							tracked={actions.trackedIds.has(item.tmdbId)}
							adding={actions.addingIds.has(item.tmdbId)}
							onPress={openTitle}
							onLongPress={setPreviewItem}
							onAdd={actions.handleAddToWatchlist}
							onRemove={actions.handleRemoveFromWatchlist}
						/>
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
							tracked={actions.trackedIds.has(item.tmdbId)}
							adding={actions.addingIds.has(item.tmdbId)}
							onAddToWatchlist={actions.handleAddToWatchlist}
						/>
					)}
				/>
			)}

			{/* The same list menu as on the Lists page */}
			<ListMenuSheet
				list={menuOpen ? list : null}
				// Another popup only once the sheet's own modal is gone (iOS can't stack them mid-dismiss)
				onRename={() =>
					afterModalClose(() => {
						setRenameError(null);
						setRenaming(true);
					})
				}
				onShare={(target) =>
					shareListsExport([target]).catch((e: Error) => Alert.alert("Export failed", e.message))
				}
				onDelete={() => afterModalClose(() => setConfirmDelete(true))}
				onClose={() => setMenuOpen(false)}
			/>

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

			<SearchModals
				movieModal={actions.movieModal}
				onMovieModalClose={() => actions.setMovieModal(null)}
				onMovieAddOnly={actions.handleMovieAddOnly}
				onMovieAddAndWatch={actions.handleMovieAddAndWatch}
				removeModal={actions.removeModal}
				removeError={actions.removeError}
				watchedBlock={actions.watchedBlock}
				onGoToShow={(show) => {
					actions.setWatchedBlock(null);
					openTitle({
						tmdbId: show.id,
						mediaType: show.media_type ?? MediaType.TV,
					} as CustomListItem);
				}}
				onWatchedBlockClose={() => actions.setWatchedBlock(null)}
				removing={actions.removing}
				onConfirmRemove={actions.handleConfirmRemove}
				onRemoveModalClose={() => {
					actions.setRemoveModal(null);
					actions.setRemoveError(null);
				}}
				unreleasedModal={actions.unreleasedModal}
				onUnreleasedClose={() => actions.setUnreleasedModal(null)}
				resumeModal={actions.resumeModal}
				onResumeFromWhere={actions.handleResumeFromWhere}
				onStartFresh={actions.handleStartFresh}
				onResumeModalClose={() => actions.setResumeModal(null)}
				addFailure={actions.addFailure}
				onRetryAdd={actions.retryAdd}
				onAddFailureClose={actions.dismissAddFailure}
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
	// Search's grid padding (16) plus its row padding (8) read wider here than on the Search page,
	// whose list drops the row's: 4 + the row's 8 = the same 12 side margin
	gridContent: { paddingHorizontal: spacing.xs, paddingBottom: spacing.xxl * 2 },
	listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 2 },
	reorderContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 2 },
	empty: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xxl,
		paddingBottom: 120,
		gap: spacing.md,
	},
	emptyText: {
		...typography.body,
		color: colors.textSecondary,
		fontStyle: "italic",
		textAlign: "center",
	},
});
