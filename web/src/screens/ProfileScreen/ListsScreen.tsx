import { useMemo, useRef, useState } from "react";
import { App as AntApp } from "antd";
import { Reorder, useDragControls } from "motion/react";
import {
	IoAddCircleOutline,
	IoBookmarksOutline,
	IoChevronForward,
	IoCheckmark,
	IoCreateOutline,
	IoDownloadOutline,
	IoReorderThree,
	IoShareOutline,
	IoTrashOutline,
} from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { useCustomLists } from "@app/hooks/useCustomLists";
import { CircleButtonTone } from "@app/enums";
import type { CustomList } from "@app/types";
import { sameIdOrder, titleCount } from "@app/utils/customLists";
import { describeImport, parseListsExport, type ImportPlan } from "@app/utils/customListsIO";
import { useAppSelector } from "../../store";
import { CircleBackButton } from "../../components/CircleButton";
import ConfirmModal from "../../components/ConfirmModal";
import ListNameModal from "../../components/ListNameModal";
import OptionsSheet from "../../components/OptionsSheet";
import { useHideTabBar } from "../../hooks/useHideTabBar";
import { useLongPress } from "../../hooks/useLongPress";
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

interface RowProps {
	list: CustomList;
	onOpen: () => void;
	onMenu: () => void;
}

/** One list: grab the handle on the left to move it; click to open; hold / right-click for its menu */
function ListRow({ list, onOpen, onMenu }: RowProps) {
	const controls = useDragControls();
	const press = useLongPress(onMenu, onOpen);
	return (
		<Reorder.Item
			value={list}
			dragListener={false}
			dragControls={controls}
			className={styles.row}
			whileDrag={{ scale: 1.02, boxShadow: "0 8px 24px rgba(0,0,0,0.6)" }}
		>
			<span
				className={styles.handle}
				onPointerDown={(e) => controls.start(e)}
				role="button"
				aria-label={`Reorder ${list.name}`}
			>
				<IoReorderThree size={26} />
			</span>
			<button className={styles.rowMain} {...press}>
				<span className={styles.rowText}>
					<span className={styles.rowName}>{list.name}</span>
					<span className={styles.rowCount}>{titleCount(list.items.length)}</span>
				</span>
				<IoChevronForward size={18} color="var(--text-muted)" />
			</button>
		</Reorder.Item>
	);
}

/** Manage every list (app ListsScreen): reorder (✓ saves — it's the order of the profile page), import, export, create */
export default function ListsScreen() {
	const navigate = useNavigate();
	const { message, modal } = AntApp.useApp();
	const user = useAppSelector((s) => s.auth.user);
	const { lists, loading, createList, renameList, deleteList, reorderLists, planImport, applyImport } =
		useCustomLists(user?.uid);
	useHideTabBar();

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
	const fileInput = useRef<HTMLInputElement>(null);

	const goBack = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate(Paths.PROFILE));

	const save = async () => {
		if (!dirty || saving) return;
		setSaving(true);
		const ok = await reorderLists(shown.map((l) => l.id));
		setSaving(false);
		if (ok) setDraftIds(null);
		else message.error("Couldn't save the order. Check your connection and try again.");
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
					<button
						className={`${styles.iconButton} ${styles.iconButtonAccent}`}
						onClick={save}
						disabled={!dirty || saving}
						aria-label="Save order"
					>
						<IoCheckmark size={30} />
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
				<Reorder.Group
					axis="y"
					values={shown}
					onReorder={(next) => setDraftIds(next.map((l) => l.id))}
					className={styles.list}
				>
					{shown.map((list) => (
						<ListRow
							key={list.id}
							list={list}
							onOpen={() => navigate(listPath(list.id))}
							onMenu={() => setMenuList(list)}
						/>
					))}
				</Reorder.Group>
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
									icon: <IoShareOutline size={22} />,
									onClick: () => downloadListsExport([menuList]),
								},
								{
									key: "rename",
									label: "Rename list",
									icon: <IoCreateOutline size={22} />,
									onClick: () => {
										setNameError(null);
										setNaming(menuList);
									},
								},
								{
									key: "delete",
									label: "Delete list",
									icon: <IoTrashOutline size={22} color={colors.destructiveRed} />,
									destructive: true,
									onClick: () => setDeleteTarget(menuList),
								},
							]
						: []
				}
				onClose={() => setMenuList(null)}
			/>

			<ListNameModal
				visible={naming !== null}
				title={naming === "new" ? "New List" : "Rename List"}
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
				hint={importPlan ? `This will make these changes: ${describeImport(importPlan)}` : undefined}
				confirmLabel="Import"
				confirmColor="var(--primary)"
				loading={importing}
				onConfirm={confirmImport}
				onClose={() => setImportPlan(null)}
			/>
		</div>
	);
}
