import { Fragment, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Spin } from "antd";
import { IoAdd, IoCheckmarkCircle, IoEllipseOutline } from "react-icons/io5";
import { CUSTOM_LIST_ITEM_MAX } from "@app/enums";
import type { CustomList, CustomListEntry } from "@app/types";
import { useCustomLists } from "@app/hooks/useCustomLists";
import { listHasItem, sheetListOrder, titleCount } from "@app/utils/customLists";
import { useAppSelector } from "../store";
import { colors } from "../theme";
import BottomSheet, { SheetHeader, SheetOption, sheetStyles } from "./BottomSheet";
import ListNameModal from "./ListNameModal";
import styles from "./styles/AddToList.module.scss";

interface Props {
	/** The title being listed; null = closed */
	entry: CustomListEntry | null;
	onClose: () => void;
}

/** Strong ease-out: the tick answers the click at once (app TICK_EASE) */
const TICK_EASE = [0.23, 1, 0.32, 1] as const;

const NAME_ERRORS = {
	taken: "You already have a list with that name.",
	limit: "You've reached the maximum number of lists.",
	failed: "Couldn't create the list. Check your connection and try again.",
	empty: "Give the list a name.",
} as const;

/**
 * "Add to List" (app AddToListSheet): tick the lists a title belongs to (each click saves at once),
 * or create a new one with it inside. A list is a bookmark — this never starts tracking the title.
 * Same shell as the watch count sheet: the title's logo (its name after a wait), grouped rows.
 */
export default function AddToListSheet({ entry, onClose }: Props) {
	const user = useAppSelector((s) => s.auth.user);
	const { lists, loading, createList, addToList, removeFromList } = useCustomLists(user?.uid);
	const [naming, setNaming] = useState(false);
	const [creating, setCreating] = useState(false);
	const [nameError, setNameError] = useState<string | null>(null);
	// Order the sheet opened with (most recently created / modified first) — held while it is open
	const [pinned, setPinned] = useState<string[] | null>(null);
	// Lists scrolled under the Create row → a shadow under it (rows slide under, not cut off)
	const [scrolled, setScrolled] = useState(false);
	const ordered = useMemo(() => sheetListOrder(lists, pinned), [lists, pinned]);

	useEffect(() => {
		if (!entry) {
			setNaming(false);
			setNameError(null);
			setPinned(null);
		}
	}, [entry]);

	useEffect(() => {
		if (entry && !loading && !pinned) setPinned(sheetListOrder(lists, null).map((l) => l.id));
	}, [entry, loading, lists, pinned]);

	const handleCreate = async (name: string) => {
		if (!entry) return;
		setCreating(true);
		const result = await createList(name, entry);
		setCreating(false);
		// Back to the sheet: the new list shows ticked with its count, confirming the add
		if (result.ok) setNaming(false);
		else setNameError(NAME_ERRORS[result.reason]);
	};

	const toggle = (list: CustomList, has: boolean) => {
		if (!entry) return;
		if (has) removeFromList(list.id, entry.tmdbId, entry.mediaType);
		else addToList(list.id, entry);
	};

	return (
		<>
			{/* Naming swaps the sheet for the name popup; creating or cancelling brings the sheet back */}
			<BottomSheet visible={!!entry && !naming} label="Add to List" onClose={onClose}>
				{entry && (
					<>
						<SheetHeader
							title={entry.title}
							subtitle="Add to List"
							tmdbId={entry.tmdbId}
							mediaType={entry.mediaType}
							centered
						/>
						{/* One card: Create fixed on top, the lists scroll under it and run off the bottom
						    edge; scrolled to the end, a nav-bar-high gap closes it */}
						<div className={styles.card}>
							<div className={styles.createRow}>
								<SheetOption
									icon={IoAdd}
									color={colors.accent}
									title="Create New List"
									hint="Starts with this title"
									onClick={() => {
										setNameError(null);
										setNaming(true);
									}}
								/>
								<div className={styles.divider} />
							</div>
							{/* The sheet drags from anywhere — a press here scrolls the lists instead */}
							<div
								className={`${styles.listScroll} ${scrolled ? styles.scrolled : ""}`}
								onPointerDownCapture={(e) => e.stopPropagation()}
								onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
							>
								<div className={styles.rows}>
									{loading ? (
										<div className={styles.loader}>
											<Spin size="small" />
										</div>
									) : ordered.length === 0 ? (
										<p className={styles.empty}>You don't have any lists yet.</p>
									) : (
										ordered.map((list, i) => {
											const has = listHasItem(list, entry.tmdbId, entry.mediaType);
											const full = !has && list.items.length >= CUSTOM_LIST_ITEM_MAX;
											return (
												<Fragment key={list.id}>
													{i > 0 && <div className={styles.separator} />}
													<button
														type="button"
														role="checkbox"
														aria-checked={has}
														disabled={full}
														className={`${sheetStyles.row} ${sheetStyles.option} ${styles.listRow}`}
														onClick={() => toggle(list, has)}
													>
														<span className={sheetStyles.rowContent}>
															<span className={`${sheetStyles.rowText} ${styles.truncate}`}>
																{list.name}
															</span>
															<span className={sheetStyles.rowHint}>
																{full ? "List is full" : titleCount(list.items.length)}
															</span>
														</span>
														<Tick checked={has} />
													</button>
												</Fragment>
											);
										})
									)}
								</div>
							</div>
						</div>
					</>
				)}
			</BottomSheet>

			<ListNameModal
				visible={!!entry && naming}
				title="New List"
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

/** Ring ↔ filled check; a change dips it to 0.85 and settles back (app Tick) */
function Tick({ checked }: { checked: boolean }) {
	// Opening shows the state as it is; only a change animates
	const [prev, setPrev] = useState(checked);
	const [changed, setChanged] = useState(false);
	if (checked !== prev) {
		setPrev(checked);
		setChanged(true);
	}
	const Icon = checked ? IoCheckmarkCircle : IoEllipseOutline;
	return (
		<motion.span
			key={String(checked)}
			className={`${styles.tick} ${checked ? styles.tickOn : ""}`}
			initial={changed ? { transform: "scale(0.85)" } : false}
			animate={{ transform: "scale(1)", transition: { duration: 0.18, ease: TICK_EASE } }}
		>
			<Icon size={26} />
		</motion.span>
	);
}
