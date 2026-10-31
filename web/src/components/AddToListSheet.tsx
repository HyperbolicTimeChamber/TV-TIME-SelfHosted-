import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Spin } from "antd";
import { IoAddCircle, IoCheckmarkCircle, IoEllipseOutline } from "react-icons/io5";
import { CUSTOM_LIST_ITEM_MAX } from "@app/enums";
import type { CustomListEntry } from "@app/types";
import { useCustomLists } from "@app/hooks/useCustomLists";
import { listHasItem } from "@app/utils/customLists";
import { useAppSelector } from "../store";
import ListNameModal from "./ListNameModal";
import styles from "./styles/WatchActionSheet.module.scss";

interface Props {
	/** The title being listed; null = closed */
	entry: CustomListEntry | null;
	onClose: () => void;
}

const NAME_ERRORS = {
	taken: "You already have a list with that name.",
	limit: "You've reached the maximum number of lists.",
	failed: "Couldn't create the list. Check your connection and try again.",
	empty: "Give the list a name.",
} as const;

/**
 * "Add to List" (app AddToListSheet): tick the lists a title belongs to (each click saves at once),
 * or create a new one with it inside. A list is a bookmark — this never starts tracking the title.
 */
export default function AddToListSheet({ entry, onClose }: Props) {
	const user = useAppSelector((s) => s.auth.user);
	const { lists, loading, createList, addToList, removeFromList } = useCustomLists(user?.uid);
	const [naming, setNaming] = useState(false);
	const [creating, setCreating] = useState(false);
	const [nameError, setNameError] = useState<string | null>(null);

	useEffect(() => {
		if (!entry) {
			setNaming(false);
			setNameError(null);
		}
	}, [entry]);

	const handleCreate = async (name: string) => {
		if (!entry) return;
		setCreating(true);
		const result = await createList(name, entry);
		setCreating(false);
		if (result.ok) {
			setNaming(false);
			onClose();
		} else {
			setNameError(NAME_ERRORS[result.reason]);
		}
	};

	// Naming swaps the sheet for the name popup; cancelling it brings the sheet back
	const sheetOpen = !!entry && !naming;

	return (
		<>
			{createPortal(
				<AnimatePresence>
					{sheetOpen && (
						<motion.div
							className={styles.overlay}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							onClick={onClose}
						>
							<motion.div
								className={styles.sheet}
								role="dialog"
								aria-label="Add to List"
								initial={{ y: "100%" }}
								animate={{ y: 0, transition: { type: "spring", damping: 20, stiffness: 200 } }}
								exit={{ y: "100%", transition: { duration: 0.2 } }}
								drag="y"
								dragConstraints={{ top: 0, bottom: 0 }}
								dragElastic={{ top: 0, bottom: 1 }}
								onDragEnd={(_, info) => {
									if (info.offset.y > 80 || info.velocity.y > 500) onClose();
								}}
								onClick={(e) => e.stopPropagation()}
							>
								<div className={styles.handle} />
								<p className={styles.title}>Add to List</p>
								<p className={`${styles.subtitle} ${styles.optionTruncate}`}>{entry?.title}</p>

								<button
									className={styles.option}
									onClick={() => {
										setNameError(null);
										setNaming(true);
									}}
								>
									<span className={styles.optionIcon}>
										<IoAddCircle size={26} className={styles.optionAccent} />
									</span>
									<span className={`${styles.optionText} ${styles.optionAccent}`}>
										Create New List
									</span>
								</button>

								{loading ? (
									<div className={styles.sheetLoader}>
										<Spin size="small" />
									</div>
								) : lists.length === 0 ? (
									<p className={styles.sheetEmpty}>You don't have any lists yet.</p>
								) : (
									<div className={styles.listScroll}>
										{lists.map((list) => {
											const has = !!entry && listHasItem(list, entry.tmdbId, entry.mediaType);
											const full = !has && list.items.length >= CUSTOM_LIST_ITEM_MAX;
											const Check = has ? IoCheckmarkCircle : IoEllipseOutline;
											return (
												<button
													key={list.id}
													className={`${styles.option} ${full ? styles.optionDisabled : ""}`}
													disabled={full || !entry}
													aria-pressed={has}
													onClick={() => {
														if (!entry) return;
														if (has) removeFromList(list.id, entry.tmdbId, entry.mediaType);
														else addToList(list.id, entry);
													}}
												>
													<span className={`${styles.optionContent} ${styles.optionGrow}`}>
														<span className={`${styles.optionText} ${styles.optionTruncate}`}>
															{list.name}
														</span>
														<span className={styles.optionHint}>
															{full
																? "List is full"
																: `${list.items.length} ${list.items.length === 1 ? "title" : "titles"}`}
														</span>
													</span>
													<Check size={26} className={`${styles.check} ${has ? styles.checkOn : ""}`} />
												</button>
											);
										})}
									</div>
								)}
							</motion.div>
						</motion.div>
					)}
				</AnimatePresence>,
				document.body,
			)}

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
