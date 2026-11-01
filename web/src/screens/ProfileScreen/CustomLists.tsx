import { useState } from "react";
import { Spin } from "antd";
import { IoAddCircleOutline, IoBookmarksOutline, IoChevronForward } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { useCustomLists } from "@app/hooks/useCustomLists";
import { useRecentlyWatched } from "@app/hooks/useRecentlyWatched";
import { useAppSelector } from "../../store";
import PosterImage from "../../components/PosterImage";
import ListNameModal from "../../components/ListNameModal";
import { ModalArt, NEW_LIST_ART } from "../../components/ModalArt";
import { NEW_LIST_HINTS, NEW_LIST_TITLE } from "@app/enums";
import type { CustomListEntry } from "@app/types";
import { profileLists } from "@app/utils/customLists";
import { Paths, listPath, showPath } from "../../routes/paths";
import styles from "./styles/ProfileScreen.module.scss";

/** Posters shown per list on the profile; the rest are one click away on the list's page */
const PREVIEW_COUNT = 15;

const NAME_ERRORS = {
	taken: "You already have a list with that name.",
	limit: "You've reached the maximum number of lists.",
	failed: "Couldn't create the list. Check your connection and try again.",
	empty: "Give the list a name.",
} as const;

/** "Lists" on the profile, under Recently Completed (app CustomLists): a Recently Watched row
 *  first, then the biggest custom lists — a row of posters each */
export default function CustomLists() {
	const navigate = useNavigate();
	const user = useAppSelector((s) => s.auth.user);
	const { lists, loading, createList } = useCustomLists(user?.uid);
	const shown = profileLists(lists);
	const recent = useRecentlyWatched();
	const [naming, setNaming] = useState(false);
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const closeNaming = () => {
		setNaming(false);
		setError(null);
	};
	const handleCreate = async (name: string) => {
		setCreating(true);
		const result = await createList(name);
		setCreating(false);
		if (result.ok) {
			closeNaming();
			navigate(listPath(result.list.id));
		} else {
			setError(NAME_ERRORS[result.reason]);
		}
	};

	return (
		<section className={styles.section}>
			<div className={styles.listsHeader}>
				<button
					className={styles.bannerTitle}
					onClick={() => navigate(Paths.LISTS)}
					aria-label="Open Lists"
				>
					<h3 className={`${styles.sectionTitle} ${styles.noMargin}`}>Lists</h3>
					<IoChevronForward size={18} color="var(--text-muted)" />
				</button>
				<button className={styles.iconButton} onClick={() => setNaming(true)} aria-label="New list">
					<IoAddCircleOutline size={26} />
				</button>
			</div>

			{recent.items.length > 0 && (
				<div className={styles.genreSection}>
					<button className={styles.listHeaderButton} onClick={() => navigate(Paths.WATCH_HISTORY)}>
						<span className={styles.listName}>Recently Watched</span>
						<IoChevronForward size={16} color="var(--text-muted)" />
					</button>
					<PosterRow items={recent.items} />
				</div>
			)}

			{loading && lists.length === 0 ? (
				<div className={styles.completedLoader}>
					<Spin size="small" />
				</div>
			) : lists.length === 0 ? (
				<button className={styles.emptyCard} onClick={() => setNaming(true)}>
					<IoBookmarksOutline size={28} color="var(--text-muted)" />
					<span className={styles.emptyTitle}>Make your first list</span>
					<span className={styles.emptyHint}>
						Save shows and movies for later without adding them to your watchlist.
					</span>
				</button>
			) : (
				shown.map((list) => (
					<div key={list.id} className={styles.genreSection}>
						<button className={styles.listHeaderButton} onClick={() => navigate(listPath(list.id))}>
							<span className={styles.listName}>{list.name}</span>
							<span className={styles.listCount}>{list.items.length}</span>
							<IoChevronForward size={16} color="var(--text-muted)" />
						</button>
						{list.items.length === 0 ? (
							<span className={styles.listEmpty}>Nothing here yet. Add titles from Search.</span>
						) : (
							<PosterRow items={list.items} />
						)}
					</div>
				))
			)}

			<ListNameModal
				visible={naming}
				title={NEW_LIST_TITLE}
				image={<ModalArt src={NEW_LIST_ART} />}
				hint={NEW_LIST_HINTS}
				confirmLabel="Create"
				error={error}
				loading={creating}
				onSubmit={handleCreate}
				onClose={closeNaming}
			/>
		</section>
	);
}

/** First posters in a row (click one to open the title) */
function PosterRow({
	items,
}: {
	items: ReadonlyArray<Pick<CustomListEntry, "tmdbId" | "mediaType" | "title" | "posterPath">>;
}) {
	const navigate = useNavigate();
	return (
		<div className={styles.posterRow}>
			{items.slice(0, PREVIEW_COUNT).map((item) => (
				<button
					key={`${item.mediaType}_${item.tmdbId}`}
					className={styles.posterButton}
					onClick={() => navigate(showPath(item.mediaType, item.tmdbId))}
				>
					<PosterImage
						posterPath={item.posterPath}
						mediaType={item.mediaType}
						className={styles.completedPoster}
						title={!item.posterPath ? item.title : undefined}
						width={140}
					/>
				</button>
			))}
		</div>
	);
}
