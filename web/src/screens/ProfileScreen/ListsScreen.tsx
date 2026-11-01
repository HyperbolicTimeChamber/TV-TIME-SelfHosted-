import { useEffect, useMemo, useRef, useState } from "react";
import { App as AntApp } from "antd";
import { Reorder, useDragControls } from "motion/react";
import {
	IoAddCircleOutline,
	IoBookmarksOutline,
	IoDownloadOutline,
	IoEllipsisVertical,
	IoList,
	IoShareOutline,
} from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { useCustomLists } from "@app/hooks/useCustomLists";
import { CircleButtonTone, MediaType, NEW_LIST_HINTS, NEW_LIST_TITLE } from "@app/enums";
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
import SkeletonBlock from "../../components/SkeletonBlock";
import { useTitleInfo } from "@app/hooks/useTitleInfo";
import { tmdbBackdropUri, tmdbPosterUri } from "@app/hooks/useTmdbImage";
import { useHideTabBar } from "../../hooks/useHideTabBar";
import { downloadListsExport, readListsFile } from "../../platform/customListsFiles";
import { Paths, listPath } from "../../routes/paths";
import { colors } from "../../theme";
import ListMenuSheet from "./ListMenuSheet";
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
/** Slots in a card's strip: posters, the last one a "+N" tile when more are left (app STRIP_SLOTS) */
const STRIP_SLOTS = 5;
/** "+N" for the strip's last tile; capped so it always fits (app moreLabel) */
const moreLabel = (n: number) => (n > 99 ? "99+" : `+${n}`);

/**
 * A list's first posters (app PosterStrip). Up to STRIP_SLOTS fit as they are; more → the last slot
 * becomes "+N", the next poster dimmed under it (a "+1" would waste the slot)
 */
function PosterStrip({ items }: { items: CustomList["items"] }) {
	const overflow = items.length > STRIP_SLOTS;
	const shown = items.slice(0, overflow ? STRIP_SLOTS - 1 : STRIP_SLOTS);
	const next = overflow ? items[STRIP_SLOTS - 1] : null;
	const more = items.length - shown.length;
	return (
		<span className={styles.strip}>
			{shown.map((item) => (
				<PosterImage
					key={`${item.mediaType}_${item.tmdbId}`}
					posterPath={item.posterPath}
					mediaType={item.mediaType}
					className={styles.stripPoster}
					width={56}
				/>
			))}
			{next && (
				<span className={styles.moreTile} aria-label={`${more} more`}>
					<PosterImage
						posterPath={next.posterPath}
						mediaType={next.mediaType}
						className={styles.morePoster}
						width={56}
					/>
					<span
						className={`${styles.moreText} ${more >= 100 ? styles.moreTextXs : more >= 10 ? styles.moreTextSm : ""}`}
					>
						{moreLabel(more)}
					</span>
				</span>
			)}
		</span>
	);
}
/** Card width the backdrop is requested at (calendar CARD_MAX_WIDTH) */
const CARD_MAX_WIDTH = 440;
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
	const cover = listCoverItem(list);
	const { data: info, isPending } = useTitleInfo(
		cover?.tmdbId ?? 0,
		cover?.mediaType ?? MediaType.TV,
		!!cover,
	);
	const loading = !!cover && isPending;
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
			className={styles.card}
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
			{info?.backdropPath ? (
				<img
					src={tmdbBackdropUri(info.backdropPath, CARD_MAX_WIDTH)}
					alt=""
					className={styles.cardBg}
					loading="lazy"
				/>
			) : info && cover?.posterPath ? (
				<img
					src={tmdbPosterUri(cover.posterPath, 185)}
					alt=""
					className={`${styles.cardBg} ${styles.cardBgPoster}`}
					loading="lazy"
				/>
			) : loading ? (
				<SkeletonBlock className={styles.cardBgSkeleton} />
			) : null}
			{cover && <span className={styles.cardOverlay} />}
			{/* ⋮ rides the name line (app nameRow): it belongs to the list, and lines up card to card */}
			<div className={styles.cardInfo}>
				<button
					className={styles.cardMain}
					onClick={() => {
						if (dragged.current) dragged.current = false;
						else onOpen();
					}}
					aria-label={`${list.name}, ${titleCount(list.items.length)}`}
				>
					<span className={styles.cardName}>{list.name}</span>
					{list.items.length > 0 ? (
						<PosterStrip items={list.items} />
					) : (
						<span className={styles.emptyLine}>Nothing here yet</span>
					)}
				</button>
				<button
					className={`${styles.menuButton} ${styles.cardMenu}`}
					onPointerDown={(e) => e.stopPropagation()}
					onClick={onMenu}
					aria-label={`Options for ${list.name}`}
				>
					<IoEllipsisVertical size={20} />
				</button>
			</div>
			<span className={styles.square}>
				<span className={styles.squareTitle}>{list.items.length === 1 ? "TITLE" : "TITLES"}</span>
				<span className={styles.squareRule} />
				<span className={styles.squareValue}>{list.items.length}</span>
			</span>
		</Reorder.Item>
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
	// Import / export, behind the top bar's ⋮ (app pageMenuOpen)
	const [pageMenuOpen, setPageMenuOpen] = useState(false);
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
						onClick={() => setPageMenuOpen(true)}
						aria-label="More list options"
					>
						<IoEllipsisVertical size={24} />
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
				{/* In the sticky header (not the list, where the fade would hide it): the count, and what
				    holding a card does (app hint) */}
				{lists.length > 0 && (
					<p className={styles.hint}>
						{lists.length === 1 ? "1 list" : `${lists.length} lists · hold one to reorder`}
					</p>
				)}
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

			<BottomSheet
				visible={pageMenuOpen}
				label="List options"
				onClose={() => setPageMenuOpen(false)}
			>
				<SheetGroup>
					<SheetOption
						icon={IoDownloadOutline}
						color={colors.accent}
						title="Import lists"
						hint="From a file someone shared with you"
						onClick={() => {
							setPageMenuOpen(false);
							fileInput.current?.click();
						}}
					/>
					{lists.length > 0 && (
						<SheetOption
							icon={IoShareOutline}
							color={colors.accent}
							title="Export all lists"
							hint="As one file you can share or keep"
							onClick={() => {
								setPageMenuOpen(false);
								downloadListsExport(lists);
							}}
						/>
					)}
				</SheetGroup>
			</BottomSheet>

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
