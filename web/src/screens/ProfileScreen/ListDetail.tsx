import { useEffect, useState } from "react";
import { App as AntApp } from "antd";
import { Reorder } from "motion/react";
import {
	IoBookmarkOutline,
	IoBookmarksOutline,
	IoCheckmark,
	IoClose,
	IoEllipsisVertical,
	IoGrid,
	IoList,
	IoSwapVertical,
	IoTrashOutline,
} from "react-icons/io5";
import { useNavigate, useParams } from "react-router-dom";
import { useCustomLists } from "@app/hooks/useCustomLists";
import { useCustomListView } from "@app/hooks/useCustomListView";
import { CircleButtonTone, CustomListView, MediaType } from "@app/enums";
import type { CustomListItem } from "@app/types";
import { sameItemOrder, titleCount } from "@app/utils/customLists";
import { useAppSelector } from "../../store";
import { CircleBackButton } from "../../components/CircleButton";
import ListMenuSheet from "./ListMenuSheet";
import { downloadListsExport } from "../../platform/customListsFiles";
import ConfirmModal from "../../components/ConfirmModal";
import ListNameModal from "../../components/ListNameModal";
import AddToListSheet from "../../components/AddToListSheet";
import type { ShowDrawerAction } from "../../components/ShowDrawer";
import { useHideTabBar } from "../../hooks/useHideTabBar";
import SwipeBackPage from "../../components/SwipeBackPage";
import { Paths, showPath } from "../../routes/paths";
import { colors } from "../../theme";
import { ListGridCard, ListItemPreview, ListRow, ReorderRow } from "./ListItemViews";
import { useSearchActions } from "@app/screens/SearchScreen/useSearchActions";
import SearchModals from "../SearchScreen/SearchModals";
import searchStyles from "../SearchScreen/styles/SearchScreen.module.scss";
import styles from "./styles/ListDetail.module.scss";

const RENAME_ERRORS = {
	taken: "You already have a list with that name.",
	empty: "Give the list a name.",
	failed: "Couldn't rename the list. Check your connection and try again.",
} as const;

const itemKey = (i: CustomListItem) => `${i.mediaType}_${i.tmdbId}`;

/**
 * One custom list (app ListDetail). Grid or List view; hold / right-click a title for its preview
 * card (+ add to another list / remove / export); the reorder button switches to drag-by-handle mode.
 */
export default function ListDetailScreen() {
	const navigate = useNavigate();
	const { message } = AntApp.useApp();
	const { listId = "" } = useParams();
	const user = useAppSelector((s) => s.auth.user);
	const { lists, loading, renameList, deleteList, removeFromList, reorderItems } = useCustomLists(
		user?.uid,
	);
	const list = lists.find((l) => l.id === listId);
	const [view, setView] = useCustomListView();
	// Adding to / removing from the watchlist from a card: the same flow (and popups) as Search
	const actions = useSearchActions();
	useHideTabBar();

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

	// Opened directly (no history entry) → back goes to Profile
	const goBack = () =>
		(window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate(Paths.PROFILE);

	// Deleted (here or on another device): nothing left to show
	useEffect(() => {
		if (!loading && !list) navigate(Paths.PROFILE, { replace: true });
	}, [loading, list, navigate]);

	if (!list) return null;

	const dirty = reordering && !sameItemOrder(draft, list.items);
	const openTitle = (item: CustomListItem) => navigate(showPath(item.mediaType, item.tmdbId));

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
		else message.error("Couldn't save the order. Check your connection and try again.");
	};

	const previewActions: ShowDrawerAction[] = previewItem
		? [
				{
					key: "add",
					label: "Add to another list",
					hint: "Keep it here too",
					icon: IoBookmarkOutline,
					onClick: () => {
						const item = previewItem;
						setPreviewItem(null);
						setListTarget(item);
					},
				},
				{
					key: "remove",
					label: `Remove from ${list.name}`,
					hint: "Only from this list",
					icon: IoTrashOutline,
					destructive: true,
					onClick: () => {
						const item = previewItem;
						setPreviewItem(null);
						setRemoveTarget(item);
					},
				},
			]
		: [];

	return (
		<SwipeBackPage onBack={goBack} disabled={reordering} className={styles.page}>
			<header className={styles.topBar}>
				<div className={styles.titleRow}>
					<CircleBackButton tone={CircleButtonTone.SURFACE_LIGHT} onClick={goBack} />
					<h1 className={styles.title}>{list.name}</h1>
					{/* Rename / share / delete behind one ⋮, as on the Lists page (app ListDetail) */}
					<button
						className={styles.iconButton}
						onClick={() => setMenuOpen(true)}
						aria-label="List options"
					>
						<IoEllipsisVertical size={24} />
					</button>
				</div>
			</header>

			{reordering ? (
				<div className={styles.subBar}>
					<p className={styles.count}>Drag a title by its handle to move it</p>
					<button
						className={styles.iconButton}
						onClick={() => setReordering(false)}
						aria-label="Cancel reordering"
					>
						<IoClose size={26} />
					</button>
					<button
						className={`${styles.iconButton} ${styles.iconButtonAccent}`}
						onClick={saveReorder}
						disabled={!dirty || saving}
						aria-label="Save order"
					>
						<IoCheckmark size={28} />
					</button>
				</div>
			) : (
				<div className={styles.subBar}>
					<p className={styles.count}>
						{titleCount(list.items.length)} · hold or right-click for options
					</p>
					{list.items.length > 1 && (
						<button
							className={styles.iconButton}
							onClick={startReorder}
							aria-label="Reorder titles"
						>
							<IoSwapVertical size={24} />
						</button>
					)}
					<button
						className={styles.iconButton}
						onClick={() =>
							setView(view === CustomListView.GRID ? CustomListView.LIST : CustomListView.GRID)
						}
						aria-label={view === CustomListView.GRID ? "Show as list" : "Show as grid"}
					>
						{view === CustomListView.GRID ? <IoList size={22} /> : <IoGrid size={20} />}
					</button>
				</div>
			)}

			{list.items.length === 0 ? (
				// Anywhere in the empty area goes to Search (where the bookmark adds titles)
				<button
					className={styles.empty}
					onClick={() => navigate(Paths.SEARCH)}
					aria-label="List is empty. Go to Search"
				>
					<img className={styles.emptyArt} src="/list-empty.png" alt="" />
					<p className={styles.emptyText}>
						Zero items... I haven't felt this empty since my last fight.
					</p>
				</button>
			) : reordering ? (
				<Reorder.Group axis="y" values={draft} onReorder={setDraft} className={styles.reorderList}>
					{draft.map((item) => (
						<ReorderRow key={itemKey(item)} item={item} />
					))}
				</Reorder.Group>
			) : view === CustomListView.GRID ? (
				// Search's result grid
				<div className={searchStyles.grid}>
					{list.items.map((item) => (
						<ListGridCard
							key={itemKey(item)}
							item={item}
							tracked={actions.trackedIds.has(item.tmdbId)}
							adding={actions.addingIds.has(item.tmdbId)}
							onPress={openTitle}
							onLongPress={setPreviewItem}
							onAdd={actions.handleAddToWatchlist}
							onRemove={actions.handleRemoveFromWatchlist}
						/>
					))}
				</div>
			) : (
				<div className={styles.listView}>
					{list.items.map((item) => (
						<ListRow
							key={itemKey(item)}
							item={item}
							onPress={() => openTitle(item)}
							onLongPress={() => setPreviewItem(item)}
							tracked={actions.trackedIds.has(item.tmdbId)}
							adding={actions.addingIds.has(item.tmdbId)}
							onAddToWatchlist={actions.handleAddToWatchlist}
						/>
					))}
				</div>
			)}

			{/* The same list menu as on the Lists page */}
			<ListMenuSheet
				list={menuOpen ? list : null}
				onRename={() => {
					setRenameError(null);
					setRenaming(true);
				}}
				onShare={(target) => downloadListsExport([target])}
				onDelete={() => setConfirmDelete(true)}
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
					navigate(showPath(show.media_type ?? MediaType.TV, show.id));
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
		</SwipeBackPage>
	);
}
