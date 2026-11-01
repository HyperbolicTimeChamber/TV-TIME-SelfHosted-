import type { ReactNode } from "react";
import { Spin } from "antd";
import { IoBookmarksOutline, IoChevronForward, IoTimeOutline } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { useCustomLists } from "@app/hooks/useCustomLists";
import { useRecentlyWatched } from "@app/hooks/useRecentlyWatched";
import type { CustomListEntry } from "@app/types";
import { profileLists } from "@app/utils/customLists";
import { useAppSelector } from "../../store";
import PosterImage from "../../components/PosterImage";
import { Paths, listPath, showPath } from "../../routes/paths";
import styles from "./styles/ProfileScreen.module.scss";

/** Posters shown per row on the profile; a "+N" tile after them opens the rest */
const PREVIEW_COUNT = 15;

type PosterItem = Pick<CustomListEntry, "tmdbId" | "mediaType" | "title" | "posterPath">;

/** "Lists" on the profile, under Recently Completed (app CustomLists): a Recently Watched row
 *  first, then the biggest custom lists — a row of posters each. New lists are made on the Lists page */
export default function CustomLists() {
	const navigate = useNavigate();
	const user = useAppSelector((s) => s.auth.user);
	const { lists, loading } = useCustomLists(user?.uid);
	const shown = profileLists(lists);
	const recent = useRecentlyWatched();

	return (
		<section className={styles.section}>
			<button
				className={styles.listsBanner}
				onClick={() => navigate(Paths.LISTS)}
				aria-label="Open Lists"
			>
				<h3 className={`${styles.sectionTitle} ${styles.noMargin}`}>Lists</h3>
				{lists.length > 0 && <span className={styles.countPill}>{lists.length}</span>}
				<span className={styles.seeAll}>See all</span>
				<IoChevronForward size={16} color="var(--text-muted)" />
			</button>

			{recent.items.length > 0 && (
				<Row icon={<IoTimeOutline size={16} />} name="Recently Watched" items={recent.items} />
			)}

			{loading && lists.length === 0 ? (
				<div className={styles.completedLoader}>
					<Spin size="small" />
				</div>
			) : lists.length === 0 ? (
				<button className={styles.emptyCard} onClick={() => navigate(Paths.LISTS)}>
					<IoBookmarksOutline size={28} color="var(--text-muted)" />
					<span className={styles.emptyTitle}>Make your first list</span>
					<span className={styles.emptyHint}>
						Save shows and movies for later without adding them to your watchlist.
					</span>
				</button>
			) : (
				shown.map((list) => (
					<Row
						key={list.id}
						name={list.name}
						count={list.items.length}
						onOpen={() => navigate(listPath(list.id))}
						items={list.items}
					/>
				))
			)}
		</section>
	);
}

/** One row: a header (name, count, chevron on the right — the whole line opens it) over posters.
 *  No `onOpen` (Recently Watched): a plain label, no chevron — only its posters are clickable */
function Row({
	icon,
	name,
	count,
	onOpen,
	items,
}: {
	/** Marks an automatic row (Recently Watched) apart from the user's own lists */
	icon?: ReactNode;
	name: string;
	count?: number;
	onOpen?: () => void;
	items: ReadonlyArray<PosterItem>;
}) {
	const navigate = useNavigate();
	const more = items.length - PREVIEW_COUNT;
	const label = (
		<>
			{icon && <span className={styles.listRowIcon}>{icon}</span>}
			<span className={styles.listRowName}>{name}</span>
			{count !== undefined && <span className={styles.countPill}>{count}</span>}
		</>
	);
	return (
		<div className={styles.listRow}>
			{onOpen ? (
				<button className={styles.listRowHeader} onClick={onOpen}>
					{label}
					<IoChevronForward className={styles.listRowChevron} size={16} />
				</button>
			) : (
				<div className={`${styles.listRowHeader} ${styles.listRowLabel}`}>{label}</div>
			)}
			<div className={styles.posterRow}>
				{items.slice(0, PREVIEW_COUNT).map((item) => (
					<button
						key={`${item.mediaType}_${item.tmdbId}`}
						className={styles.posterButton}
						onClick={() => navigate(showPath(item.mediaType, item.tmdbId))}
						aria-label={item.title}
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
				{more > 0 && onOpen && (
					<button
						className={`${styles.posterButton} ${styles.moreTile}`}
						onClick={onOpen}
						aria-label={`${more} more`}
					>
						+{more}
					</button>
				)}
			</div>
		</div>
	);
}
