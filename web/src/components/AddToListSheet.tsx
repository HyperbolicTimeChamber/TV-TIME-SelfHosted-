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
import { IoBookmark, IoBookmarkOutline, IoList } from "react-icons/io5";
import { CUSTOM_LIST_ITEM_MAX, NEW_LIST_HINTS, NEW_LIST_TITLE } from "@app/enums";
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
export default function AddToListSheet({ entry, onClose }: Props) {
	const user = useAppSelector((s) => s.auth.user);
	const { lists, loading, createList, addToList, removeFromList } = useCustomLists(user?.uid);
	const [naming, setNaming] = useState(false);
	const [creating, setCreating] = useState(false);
	const [nameError, setNameError] = useState<string | null>(null);
	// Order the sheet opened with (lists holding the title, then newest) — held while it is open
	const [pinned, setPinned] = useState<string[] | null>(null);
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
			setExpanded(false);
			setHeight(undefined);
		}
	}, [entry]);

	useEffect(() => {
		if (entry && !loading && !pinned)
			setPinned(sheetListOrder(lists, null, entry).map((l) => l.id));
	}, [entry, loading, lists, pinned]);

	const handleCreate = async (name: string) => {
		if (!entry) return;
		setCreating(true);
		const result = await createList(name, entry);
		setCreating(false);
		// Back to the sheet: the new list shows on top, bookmarked, confirming the add
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
							<div className={styles.heading}>
								<span className={styles.headingText}>Lists</span>
								<button
									type="button"
									className={styles.newList}
									onClick={() => {
										setNameError(null);
										setNaming(true);
									}}
								>
									New list
								</button>
							</div>

							{loading ? (
								<div className={styles.loader}>
									<Spin size="small" />
								</div>
							) : ordered.length === 0 ? (
								<p className={styles.empty}>No lists yet — make one with New list.</p>
							) : (
								ordered.map((list) => {
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
												<span className={styles.rowHint}>
													{full ? "List is full" : titleCount(list.items.length)}
												</span>
											</span>
											<Badge listed={has} />
										</button>
									);
								})
							)}
						</div>
					</>
				)}
			</BottomSheet>

			<ListNameModal
				visible={!!entry && naming}
				title={NEW_LIST_TITLE}
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

/** The search cards' Add to List badge: outline bookmark, filled blue once listed. A change dips
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
