import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type PointerEvent,
	type TouchEvent,
	type WheelEvent,
} from "react";
import { motion } from "motion/react";
import { Spin } from "antd";
import { IoAdd, IoBookmark, IoBookmarkOutline, IoList, IoSearch } from "react-icons/io5";
import { MdOutlineBookmarkAdd } from "react-icons/md";
import {
	ADD_TO_LIST_SEARCH_MIN_LISTS,
	CUSTOM_LIST_ITEM_MAX,
	NEW_LIST_HINTS,
	NEW_LIST_TITLE,
} from "@app/enums";
import type { CustomList, CustomListEntry } from "@app/types";
import { useCustomLists } from "@app/hooks/useCustomLists";
import { listCoverItem, listHasItem, sheetListOrder, titleCount } from "@app/utils/customLists";
import { useAppSelector } from "../store";
import BottomSheet, { SheetHeader } from "./BottomSheet";
import ListNameModal from "./ListNameModal";
import { ModalArt, NEW_LIST_ART } from "./ModalArt";
import PosterImage from "./PosterImage";
import styles from "./styles/AddToList.module.scss";

interface Props {
	/** The title being listed; null = closed */
	entry: CustomListEntry | null;
	onClose: () => void;
	/** No "N titles" under each list (the show info page) */
	hideCounts?: boolean;
}

/** Gap left above the grown sheet */
const TOP_GAP = 8;
/** Part-way sheet: the lists take at most this share of the screen (CSS .listScroll) */
const COLLAPSED_SHARE = 0.55;
/** Grow / shrink duration (CSS .listScroll transition) */
const GROW_MS = 300;
/** Finger travel before a drag counts as grow / shrink */
const DRAG_SLOP = 6;
/** Strong ease-out: the badge answers the click at once (app TAP_EASE) */
const TAP_EASE = [0.23, 1, 0.32, 1] as const;

enum ListSort {
	RECENT = "Recent",
	NAME = "A–Z",
}

const NAME_ERRORS = {
	taken: "You already have a list with that name.",
	limit: "You've reached the maximum number of lists.",
	failed: "Couldn't create the list. Check your connection and try again.",
	empty: "Give the list a name.",
} as const;

/**
 * "Add to List" (app AddToListSheet): click the lists a title belongs to (each click saves at
 * once), or make a new one with it inside. A list is a bookmark — this never starts tracking the
 * title. The title's logo on top, a Lists heading with New list, then the lists (cover, name,
 * count) with the search cards' bookmark badge.
 */
export default function AddToListSheet({ entry, onClose, hideCounts = false }: Props) {
	const user = useAppSelector((s) => s.auth.user);
	const { lists, loading, createList, addToList, removeFromList } = useCustomLists(user?.uid);
	const [naming, setNaming] = useState(false);
	// Name the popup opens with: the search text when made from "Create “…”" (app AddToListSheet)
	const [draftName, setDraftName] = useState("");
	const [creating, setCreating] = useState(false);
	const [nameError, setNameError] = useState<string | null>(null);
	// Order the sheet opened with (lists holding the title, then newest) — held while it is open
	const [pinned, setPinned] = useState<string[] | null>(null);
	// Lists that held the title when the sheet opened: the "In Lists" section, fixed while open
	const [openSaved, setOpenSaved] = useState<ReadonlySet<string>>(new Set());
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState(ListSort.RECENT);
	const ordered = useMemo(
		() => sheetListOrder(lists, pinned, entry ?? undefined),
		[lists, pinned, entry],
	);
	// Opens part way; the first scroll grows the sheet to the top, only then do the lists scroll
	const [expanded, setExpanded] = useState(false);
	// Explicit height while growing / grown / shrinking (auto height can't animate); undefined at rest
	const [height, setHeight] = useState<number | undefined>(undefined);
	const scrollRef = useRef<HTMLDivElement>(null);
	const touchY = useRef<number | null>(null);

	const expand = () => {
		const el = scrollRef.current;
		const sheet = el?.closest("[role=dialog]");
		if (!el || !sheet || expanded) return;
		// Everything fits already → nothing to grow into (no empty space beyond the nav-bar gap)
		if (el.scrollHeight <= el.clientHeight) return;
		// Everything above the lists keeps its size; the lists grow to fit their content, never
		// past the top edge
		const above = el.getBoundingClientRect().top - sheet.getBoundingClientRect().top;
		const to = Math.min(el.scrollHeight, window.innerHeight - above - TOP_GAP);
		// From the height it has now, so the grow starts where the eye is
		setHeight(el.offsetHeight);
		requestAnimationFrame(() => requestAnimationFrame(() => setHeight(to)));
		setExpanded(true);
	};
	const collapse = () => {
		const el = scrollRef.current;
		if (!el) return;
		// Back to what the part-way sheet shows (its content, up to the cap), then hand back to CSS
		setHeight(Math.min(el.scrollHeight, window.innerHeight * COLLAPSED_SHARE));
		setExpanded(false);
		window.setTimeout(() => setHeight(undefined), GROW_MS);
	};

	// Wheel / drag up while part way → grow first; drag down at the very top → back part way
	const onWheel = (e: WheelEvent<HTMLDivElement>) => {
		if (!expanded && e.deltaY > 0) expand();
		else if (expanded && e.deltaY < 0 && e.currentTarget.scrollTop <= 0) collapse();
	};
	const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
		touchY.current = e.touches[0].clientY;
	};
	const onTouchMove = (e: TouchEvent<HTMLDivElement>) => {
		if (touchY.current == null) return;
		const dy = e.touches[0].clientY - touchY.current;
		if (!expanded && dy < -DRAG_SLOP) {
			touchY.current = null;
			expand();
		} else if (expanded && dy > DRAG_SLOP && e.currentTarget.scrollTop <= 0) {
			touchY.current = null;
			collapse();
		}
	};

	useEffect(() => {
		if (!entry) {
			setNaming(false);
			setNameError(null);
			setPinned(null);
			setOpenSaved(new Set());
			setSearch("");
			setSort(ListSort.RECENT);
			setExpanded(false);
			setHeight(undefined);
		}
	}, [entry]);

	useEffect(() => {
		if (entry && !loading && !pinned) {
			setPinned(sheetListOrder(lists, null, entry).map((l) => l.id));
			const holding = lists.filter((l) => listHasItem(l, entry.tmdbId, entry.mediaType));
			setOpenSaved(new Set(holding.map((l) => l.id)));
		}
	}, [entry, loading, lists, pinned]);

	// "In Lists": held the title at open (a list made from here joins it). The rest: filtered by the
	// search, in the chosen order (app AddToListSheet)
	const saved = useMemo(
		() => ordered.filter((l) => openSaved.has(l.id) || !pinned?.includes(l.id)),
		[ordered, openSaved, pinned],
	);
	const others = useMemo(() => {
		const term = search.trim().toLowerCase();
		const rest = ordered.filter(
			(l) => !saved.includes(l) && (!term || l.name.toLowerCase().includes(term)),
		);
		return sort === ListSort.NAME ? [...rest].sort((a, b) => a.name.localeCompare(b.name)) : rest;
	}, [ordered, saved, search, sort]);
	// Find list + Sort only earn their room with a few lists left to look through (the lists
	// already holding the title sit above); counted before the search filter so typing never hides them
	const searchable = useMemo(
		() => ordered.filter((l) => !saved.includes(l)).length >= ADD_TO_LIST_SEARCH_MIN_LISTS,
		[ordered, saved],
	);

	const handleCreate = async (name: string) => {
		if (!entry) return;
		setCreating(true);
		const result = await createList(name, entry);
		setCreating(false);
		// Back to the sheet: the new list shows on top, bookmarked, confirming the add
		if (result.ok) {
			setNaming(false);
			setSearch("");
		} else setNameError(NAME_ERRORS[result.reason]);
	};

	const toggle = (list: CustomList, has: boolean) => {
		if (!entry) return;
		if (has) removeFromList(list.id, entry.tmdbId, entry.mediaType);
		else addToList(list.id, entry);
	};

	const startNaming = (prefill = "") => {
		setNameError(null);
		setDraftName(prefill);
		setNaming(true);
	};
	// Searched for a list that doesn't exist → offer to make it, named as typed
	const typedName = search.trim();
	const canCreateTyped =
		typedName !== "" && !lists.some((l) => l.name.trim().toLowerCase() === typedName.toLowerCase());

	const renderRow = (list: CustomList) => {
		if (!entry) return null;
		const has = listHasItem(list, entry.tmdbId, entry.mediaType);
		const full = !has && list.items.length >= CUSTOM_LIST_ITEM_MAX;
		const cover = listCoverItem(list);
		return (
			<button
				key={list.id}
				type="button"
				role="checkbox"
				aria-checked={has}
				aria-label={list.name}
				disabled={full}
				className={styles.row}
				onClick={() => toggle(list, has)}
			>
				{cover ? (
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
				)}
				<span className={styles.rowContent}>
					<span className={styles.rowText}>{list.name}</span>
					{(full || !hideCounts) && (
						<span className={styles.rowHint}>
							{full ? "List is full" : titleCount(list.items.length)}
						</span>
					)}
				</span>
				<Badge listed={has} />
			</button>
		);
	};

	return (
		<>
			{/* Naming swaps the sheet for the name popup; creating or cancelling brings the sheet back */}
			<BottomSheet visible={!!entry && !naming} label="Add to List" onClose={onClose}>
				{entry && (
					<>
						<SheetHeader
							title={entry.title}
							tmdbId={entry.tmdbId}
							mediaType={entry.mediaType}
							centered
						/>
						<div className={styles.divider} />
						{/* The heading scrolls away with the lists; they run off the bottom edge and,
						    scrolled to the end, a nav-bar-high gap closes them. The sheet drags from
						    anywhere — a press here grows / scrolls the lists instead */}
						<div
							ref={scrollRef}
							className={`${styles.listScroll} ${expanded ? styles.listScrollExpanded : ""}`}
							style={height !== undefined ? { height, maxHeight: "none" } : undefined}
							onPointerDownCapture={(e: PointerEvent) => e.stopPropagation()}
							onWheel={onWheel}
							onTouchStart={onTouchStart}
							onTouchMove={onTouchMove}
						>
							{loading ? (
								<div className={styles.loader}>
									<Spin size="small" />
								</div>
							) : (
								<>
									{/* Only when it holds the title already: nothing to show for a title in no list */}
									{saved.length > 0 && (
										<>
											<div className={styles.heading}>
												<span className={styles.headingText}>In Lists</span>
												<button
													type="button"
													className={styles.newList}
													onClick={() => startNaming()}
												>
													New List
												</button>
											</div>
											{saved.map(renderRow)}
										</>
									)}

									{searchable && (
										<div className={styles.searchRow}>
											<label className={styles.searchField}>
												<IoSearch size={16} />
												<input
													className={styles.searchInput}
													value={search}
													onChange={(e) => setSearch(e.target.value)}
													placeholder="Find list"
													aria-label="Find list"
													autoComplete="off"
												/>
											</label>
											<button
												type="button"
												className={styles.sortButton}
												aria-label={`Sort: ${sort}`}
												onClick={() =>
													setSort((v) => (v === ListSort.RECENT ? ListSort.NAME : ListSort.RECENT))
												}
											>
												{sort === ListSort.RECENT ? "Sort" : sort}
											</button>
										</div>
									)}

									{/* No list by that name: make it, the popup opens named as typed */}
									{canCreateTyped && (
										<motion.button
											type="button"
											className={styles.row}
											onClick={() => startNaming(typedName)}
											initial={{ opacity: 0, transform: "translateY(6px)" }}
											animate={{ opacity: 1, transform: "translateY(0px)" }}
											transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
											aria-label={`Create list ${typedName}`}
										>
											<span className={`${styles.cover} ${styles.coverCreate}`}>
												<IoAdd size={26} />
											</span>
											<span className={styles.rowContent}>
												<span className={styles.rowText}>Create “{typedName}”</span>
												<span className={styles.rowHint}>
													{others.length === 0
														? "No list by that name yet"
														: "New list, this title in it"}
												</span>
											</span>
										</motion.button>
									)}
									{others.map(renderRow)}

									<button type="button" className={styles.row} onClick={() => startNaming()}>
										<span className={`${styles.cover} ${styles.coverEmpty}`}>
											<MdOutlineBookmarkAdd size={24} />
										</span>
										<span className={styles.rowText}>New List</span>
									</button>
								</>
							)}
						</div>
						{/* Each click already saved; Done just closes */}
						<div className={styles.footer}>
							<button type="button" className={styles.done} onClick={onClose}>
								Done
							</button>
						</div>
					</>
				)}
			</BottomSheet>

			<ListNameModal
				visible={!!entry && naming}
				title={NEW_LIST_TITLE}
				suggestedName={draftName}
				image={<ModalArt src={NEW_LIST_ART} />}
				hint={NEW_LIST_HINTS}
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

/** The search cards' Add to List badge: outline bookmark, filled amber once listed. A change dips
 *  it to 0.85 and settles back (app Badge) */
function Badge({ listed }: { listed: boolean }) {
	// Opening shows the state as it is; only a change animates
	const [prev, setPrev] = useState(listed);
	const [changed, setChanged] = useState(false);
	if (listed !== prev) {
		setPrev(listed);
		setChanged(true);
	}
	const Icon = listed ? IoBookmark : IoBookmarkOutline;
	return (
		<motion.span
			key={String(listed)}
			className={`${styles.badge} ${listed ? styles.badgeActive : ""}`}
			initial={changed ? { transform: "scale(0.85)" } : false}
			animate={{ transform: "scale(1)", transition: { duration: 0.18, ease: TAP_EASE } }}
		>
			<Icon size={15} />
		</motion.span>
	);
}
