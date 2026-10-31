import { useEffect, useState } from "react";
import {
	IoBookmarksOutline,
	IoClose,
	IoCreateOutline,
	IoTrashOutline,
} from "react-icons/io5";
import { useNavigate, useParams } from "react-router-dom";
import { useCustomLists } from "@app/hooks/useCustomLists";
import { CircleButtonTone } from "@app/enums";
import type { CustomListItem } from "@app/types";
import { useAppSelector } from "../../store";
import CircleButton, { CircleBackButton } from "../../components/CircleButton";
import ConfirmModal from "../../components/ConfirmModal";
import ListNameModal from "../../components/ListNameModal";
import PosterImage from "../../components/PosterImage";
import { useHideTabBar } from "../../hooks/useHideTabBar";
import { colors } from "../../theme";
import { Paths, showPath } from "../../routes/paths";
import styles from "./styles/ListDetail.module.scss";

const RENAME_ERRORS = {
	taken: "You already have a list with that name.",
	empty: "Give the list a name.",
	failed: "Couldn't rename the list. Check your connection and try again.",
} as const;

/** One custom list (app ListDetail): its titles as a poster grid; × removes a title from the list */
export default function ListDetailScreen() {
	const navigate = useNavigate();
	const { listId = "" } = useParams();
	const user = useAppSelector((s) => s.auth.user);
	const { lists, loading, renameList, deleteList, removeFromList } = useCustomLists(user?.uid);
	const list = lists.find((l) => l.id === listId);
	useHideTabBar();

	const [renaming, setRenaming] = useState(false);
	const [renameError, setRenameError] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [removeTarget, setRemoveTarget] = useState<CustomListItem | null>(null);

	// Opened directly (no history entry) → back goes to Profile
	const goBack = () =>
		(window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate(Paths.PROFILE);

	// Deleted (here or on another device): nothing left to show
	useEffect(() => {
		if (!loading && !list) navigate(Paths.PROFILE, { replace: true });
	}, [loading, list, navigate]);

	if (!list) return null;

	const handleRename = async (name: string) => {
		const result = await renameList(listId, name);
		if (result === "ok") {
			setRenaming(false);
			setRenameError(null);
		} else {
			setRenameError(RENAME_ERRORS[result]);
		}
	};

	return (
		<div className={styles.page}>
			<header className={styles.topBar}>
				<div className={styles.titleRow}>
					<CircleBackButton tone={CircleButtonTone.SURFACE_LIGHT} onClick={goBack} />
					<h1 className={styles.title}>{list.name}</h1>
					<CircleButton
						tone={CircleButtonTone.SURFACE_LIGHT}
						onClick={() => {
							setRenameError(null);
							setRenaming(true);
						}}
						ariaLabel="Rename list"
					>
						<IoCreateOutline size={22} />
					</CircleButton>
					<CircleButton
						tone={CircleButtonTone.SURFACE_LIGHT}
						onClick={() => setConfirmDelete(true)}
						ariaLabel="Delete list"
					>
						<IoTrashOutline size={22} color={colors.destructiveRed} />
					</CircleButton>
				</div>
			</header>

			{list.items.length === 0 ? (
				<div className={styles.empty}>
					<IoBookmarksOutline size={40} color="var(--text-muted)" />
					<p className={styles.emptyTitle}>This list is empty</p>
					<p className={styles.emptyHint}>
						Click the bookmark on a show or movie in Search to add it here.
					</p>
				</div>
			) : (
				<>
					<p className={styles.count}>
						{list.items.length} {list.items.length === 1 ? "title" : "titles"}
					</p>
					<div className={styles.grid}>
						{list.items.map((item) => (
							<div key={`${item.mediaType}_${item.tmdbId}`} className={styles.cell}>
								<button
									className={styles.posterButton}
									onClick={() => navigate(showPath(item.mediaType, item.tmdbId))}
									aria-label={item.title}
								>
									<PosterImage
										posterPath={item.posterPath}
										mediaType={item.mediaType}
										className={styles.poster}
										title={!item.posterPath ? item.title : undefined}
										width={180}
									/>
								</button>
								<button
									className={styles.removeButton}
									onClick={() => setRemoveTarget(item)}
									aria-label={`Remove ${item.title} from list`}
								>
									<IoClose size={16} />
								</button>
							</div>
						))}
					</div>
				</>
			)}

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
		</div>
	);
}
