import { useEffect, useMemo, useRef, useState } from "react";
import { App as AntApp } from "antd";
import { Reorder, useDragControls } from "motion/react";
import {
	IoAddCircleOutline,
	IoBookmarksOutline,
	IoCreateOutline,
	IoDownloadOutline,
	IoEllipsisVertical,
	IoList,
	IoShareOutline,
	IoTrashOutline,
} from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { useCustomLists } from "@app/hooks/useCustomLists";
import { CircleButtonTone, NEW_LIST_HINTS, NEW_LIST_TITLE } from "@app/enums";
import type { CustomList } from "@app/types";
import { listCoverItem, titleCount } from "@app/utils/customLists";
import { describeImport, parseListsExport, type ImportPlan } from "@app/utils/customListsIO";
import { useAppSelector } from "../../store";
import { CircleBackButton } from "../../components/CircleButton";
import ConfirmModal from "../../components/ConfirmModal";
import ListNameModal from "../../components/ListNameModal";
import { ModalArt, NEW_LIST_ART } from "../../components/ModalArt";
import BottomSheet, { SheetGroup, SheetOption } from "../../components/BottomSheet";
import PosterImage from "../../components/PosterImage";
import { useHideTabBar } from "../../hooks/useHideTabBar";
import { downloadListsExport, readListsFile } from "../../platform/customListsFiles";
import { Paths, listPath } from "../../routes/paths";
import { colors } from "../../theme";
import styles from "./styles/ListsScreen.module.scss";

const NAME_ERRORS = {
	taken: "You already have a list with that name.",
	limit: "You've reached the maximum number of lists.",
	failed: "Couldn't save the list. Check your connection and try again.",
	empty: "Give the list a name.",
} as const;

const IMPORT_ERRORS = {
	invalid: "That file isn't a Watchloom lists export.",
	newer: "That file was made by a newer version of the app. Reload and try again.",
	empty: "That file doesn't contain any lists.",
	too_large: "That file is too large to be a lists export.",
	unreadable: "Couldn't read that file.",
} as const;

/** Hold this long on a row to pick it up (app: delayLongPress) */
const HOLD_MS = 250;
/** Pointer travel before the hold counts as a scroll instead */
const MOVE_CANCEL_PX = 10;
/** A drop waits this long for another before the order is written (app AUTOSAVE_MS) */
const AUTOSAVE_MS = 800;

interface RowProps {
	list: CustomList;
	onOpen: () => void;
	onMenu: () => void;
	/** Dropped after a drag: the order is ready to save */
	onDropped: () => void;
}

/**
 * One list, laid out like the Add to List drawer's rows (app ListRow): cover (the title added last),
 * name + count, ⋯ for its menu (right-click too). Click opens it; hold to pick it up and drag.
 */
function ListRow({ list, onOpen, onMenu, onDropped }: RowProps) {
	const controls = useDragControls();
	const hold = useRef<number | null>(null);
	const origin = useRef<{ x: number; y: number } | null>(null);
	// A drag ends with a click on the row — that one must not open it
	const dragged = useRef(false);
	const cancelHold = () => {
		if (hold.current) window.clearTimeout(hold.current);
		hold.current = null;
	};
	return (
		<Reorder.Item
			value={list}
			dragListener={false}
			dragControls={controls}
			className={styles.row}
			whileDrag={{ scale: 1.02, boxShadow: "0 8px 24px rgba(0,0,0,0.6)" }}
			onDragEnd={onDropped}
			onPointerDown={(e) => {
				if (e.button !== 0) return;
				const native = e.nativeEvent;
				dragged.current = false;
				origin.current = { x: e.clientX, y: e.clientY };
				hold.current = window.setTimeout(() => {
					hold.current = null;
					dragged.current = true;
					navigator.vibrate?.(15);
					controls.start(native);
				}, HOLD_MS);
			}}
			onPointerMove={(e) => {
				const o = origin.current;
				if (o && hold.current && Math.hypot(e.clientX - o.x, e.clientY - o.y) > MOVE_CANCEL_PX)
					cancelHold();
			}}
			onPointerUp={cancelHold}
			onPointerCancel={cancelHold}
			onContextMenu={(e) => {
				e.preventDefault();
				cancelHold();
				onMenu();
			}}
		>
			<button
				className={styles.rowMain}
				onClick={() => {
					if (dragged.current) dragged.current = false;
					else onOpen();
				}}
				aria-label={`${list.name}, ${titleCount(list.items.length)}`}
			>
				<ListCover list={list} />
				<span className={styles.rowText}>
					<span className={styles.rowName}>{list.name}</span>
					<span className={styles.rowCount}>{titleCount(list.items.length)}</span>
				</span>
			</button>
			<button
				className={styles.menuButton}
				onPointerDown={(e) => e.stopPropagation()}
				onClick={onMenu}
				aria-label={`Options for ${list.name}`}
			>
				<IoEllipsisVertical size={20} />
			</button>
		</Reorder.Item>
	);
}

/** A list's cover: the title added last, or a list icon when it's empty (app ListCover) */
function ListCover({ list }: { list: CustomList }) {
	const cover = listCoverItem(list);
	return cover ? (
		<PosterImage
			posterPath={cover.posterPath}
			mediaType={cover.mediaType}
			className={styles.cover}
			width={104}
		/>
	) : (
		<span className={`${styles.cover} ${styles.coverEmpty}`}>
			<IoList size={22} />
		</span>
	);
}

/**
 * A list's menu in the app's sheet style (app ListMenuSheet): the list itself on top (cover, name,
 * count — as in its row), rename / share grouped, delete on its own
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
	// Close first, then act — the next popup opens over the page, not the sheet
	const pick = (fn: (list: CustomList) => void) => () => {
		if (!list) return;
		onClose();
		fn(list);
	};
	return (
		<BottomSheet
			visible={!!list}
			label={list ? `Options for ${list.name}` : "List options"}
			onClose={onClose}
		>
			{list && (
				<>
					<div className={styles.menuHeader}>
						<ListCover list={list} />
						<span className={styles.rowText}>
							<span className={styles.rowName}>{list.name}</span>
							<span className={styles.rowCount}>{titleCount(list.items.length)}</span>
						</span>
					</div>
					<SheetGroup>
						<SheetOption
							icon={IoCreateOutline}
							color={colors.accent}
							title="Rename list"
							onClick={pick(onRename)}
						/>
						<SheetOption
							icon={IoShareOutline}
							color={colors.accent}
							title="Share list"
							hint="As a file anyone can import"
							onClick={pick(onShare)}
						/>
					</SheetGroup>
					<div className={styles.menuGap} />
					<SheetGroup>
						<SheetOption
							icon={IoTrashOutline}
							color={colors.destructiveRed}
							title="Delete list"
							hint="Removes the list, not the titles"
							destructive
							onClick={pick(onDelete)}
						/>
					</SheetGroup>
				</>
			)}
		</BottomSheet>
	);
}

/** Manage every list (app ListsScreen): reorder (saves itself), import, export, create */
export default function ListsScreen() {
	const navigate = useNavigate();
	const { message, modal } = AntApp.useApp();
	const user = useAppSelector((s) => s.auth.user);
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
	useHideTabBar();

	// Dragging edits a list of ids; null = follow the saved order
	const [draftIds, setDraftIds] = useState<string[] | null>(null);
	// Latest draft for the save timer / unmount flush (state would be stale there)
	const draftRef = useRef<string[] | null>(null);
	const saveTimer = useRef<number | null>(null);
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
	const fileInput = useRef<HTMLInputElement>(null);

	const goBack = () =>
		(window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate(Paths.PROFILE);

	// Autosave (app ListsScreen): drops settle for AUTOSAVE_MS before the order is written, so a few
	// drags in a row are one write; leaving the page writes whatever is still waiting
	const save = async () => {
		if (saveTimer.current) window.clearTimeout(saveTimer.current);
		saveTimer.current = null;
		const ids = draftRef.current;
		if (!ids) return;
		const ok = await reorderLists(ids);
		// A newer drag since → that one saves next; keep showing it
		if (draftRef.current !== ids) return;
		draftRef.current = null;
		setDraftIds(null);
		if (!ok) message.error("Couldn't save the order. Check your connection and try again.");
	};
	const saveRef = useRef(save);
	saveRef.current = save;
	useEffect(() => () => void saveRef.current(), []);
	const scheduleSave = () => {
		if (!draftRef.current) return;
		if (saveTimer.current) window.clearTimeout(saveTimer.current);
		saveTimer.current = window.setTimeout(() => void saveRef.current(), AUTOSAVE_MS);
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

	const onFileChosen = async (file: File | undefined) => {
		const picked = await readListsFile(file);
		if (!picked.ok) {
			if (picked.reason !== "canceled") message.error(IMPORT_ERRORS[picked.reason]);
			return;
		}
		const parsed = parseListsExport(picked.text);
		if (!parsed.ok) {
			message.error(IMPORT_ERRORS[parsed.reason]);
			return;
		}
		const plan = planImport(parsed.lists);
		if (plan.titlesAdded === 0 && plan.listsCreated === 0) {
			message.info("Everything in that file is already in your lists.");
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
		if (ok) modal.success({ title: "Import complete", content: describeImport(plan) });
		else message.error("Import failed. Check your connection and try again.");
	};

	return (
		<div className={styles.page}>
			<header className={styles.topBar}>
				<div className={styles.titleRow}>
					<CircleBackButton tone={CircleButtonTone.SURFACE_LIGHT} onClick={goBack} />
					<h1 className={styles.title}>Lists</h1>
					<button
						className={styles.iconButton}
						onClick={() => {
							setNameError(null);
							setNaming("new");
						}}
						aria-label="New list"
					>
						<IoAddCircleOutline size={26} />
					</button>
					<button
						className={styles.iconButton}
						onClick={() => fileInput.current?.click()}
						aria-label="Import list"
					>
						<IoDownloadOutline size={25} />
					</button>
					<button
						className={styles.iconButton}
						onClick={() => downloadListsExport(lists)}
						disabled={lists.length === 0}
						aria-label="Export all lists"
					>
						<IoShareOutline size={25} />
					</button>
				</div>
				<input
					ref={fileInput}
					type="file"
					accept=".json,application/json"
					hidden
					onChange={(e) => {
						const file = e.target.files?.[0];
						// Same file twice in a row must still fire change
						e.target.value = "";
						void onFileChosen(file);
					}}
				/>
			</header>

			{loading && lists.length === 0 ? null : lists.length === 0 ? (
				<div className={styles.empty}>
					<IoBookmarksOutline size={40} color="var(--text-muted)" />
					<p className={styles.emptyTitle}>No lists yet</p>
					<p className={styles.emptyHint}>
						Create one with the + button, or import a list someone shared with you.
					</p>
				</div>
			) : (
				<>
					{lists.length > 1 && <p className={styles.hint}>Hold a list to drag it into place</p>}
					<Reorder.Group
						axis="y"
						values={shown}
						onReorder={(next) => {
							const ids = next.map((l) => l.id);
							draftRef.current = ids;
							setDraftIds(ids);
						}}
						className={styles.list}
					>
						{shown.map((list) => (
							<ListRow
								key={list.id}
								list={list}
								onOpen={() => navigate(listPath(list.id))}
								onMenu={() => setMenuList(list)}
								onDropped={scheduleSave}
							/>
						))}
					</Reorder.Group>
				</>
			)}

			<ListMenuSheet
				list={menuList}
				onRename={(target) => {
					setNameError(null);
					setNaming(target);
				}}
				onShare={(target) => downloadListsExport([target])}
				onDelete={setDeleteTarget}
				onClose={() => setMenuList(null)}
			/>

			<ListNameModal
				visible={naming !== null}
				title={naming === "new" ? NEW_LIST_TITLE : "Rename List"}
				image={naming === "new" ? <ModalArt src={NEW_LIST_ART} /> : undefined}
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
				confirmColor="var(--primary)"
				loading={importing}
				onConfirm={confirmImport}
				onClose={() => setImportPlan(null)}
			/>
		</div>
	);
}
