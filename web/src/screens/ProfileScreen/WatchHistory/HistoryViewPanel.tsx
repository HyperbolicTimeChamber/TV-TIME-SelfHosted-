import { useMemo, useState } from "react";
import { IoAdd, IoCheckmark, IoCloseCircle, IoSearch } from "react-icons/io5";
import {
	HISTORY_FACET_MAX,
	HISTORY_KEYWORD_SUGGESTIONS,
	HistoryFilter,
	HistorySort,
} from "@app/enums";
import type { HistoryFacets } from "@app/types";
import {
	HISTORY_FILTERS,
	HISTORY_FILTER_LABEL,
	HISTORY_SORT_LABEL,
	HISTORY_SORTS,
} from "@app/utils/historyView";
import { SortPanel, sortPanelTitleClass, type SortOption } from "../../../components/SortPanel";
import styles from "./styles/WatchHistory.module.scss";

const SORT_OPTIONS: SortOption<HistorySort>[] = HISTORY_SORTS.map((value) => ({
	value,
	label: HISTORY_SORT_LABEL[value],
}));

interface Props {
	isMovie: boolean;
	sort: HistorySort;
	onSort: (sort: HistorySort) => void;
	filters: ReadonlySet<HistoryFilter>;
	onToggleFilter: (filter: HistoryFilter) => void;
	onClearFilters: () => void;
	facets: HistoryFacets;
	/** Every genre / keyword across the tab's tracked titles (the user's facets doc) */
	facetOptions: { genres: string[]; keywords: string[] };
	onToggleGenre: (genre: string) => void;
	onToggleKeyword: (keyword: string) => void;
}

/** One filter chip (status, genre or keyword): a check when on */
function Chip({
	label,
	on,
	disabled = false,
	add = false,
	onClick,
}: {
	label: string;
	on: boolean;
	disabled?: boolean;
	/** A typed keyword: a plus in place of the check */
	add?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			className={`${styles.viewChip} ${on ? styles.viewChipOn : ""}`}
			aria-pressed={on}
			disabled={disabled}
			onClick={onClick}
		>
			{on ? (
				<IoCheckmark size={15} className={styles.chipIcon} />
			) : add ? (
				<IoAdd size={15} className={styles.chipIcon} />
			) : null}
			{label}
		</button>
	);
}

/**
 * Sort order (saved) + status filters (TV only) + Genre / Keyword filters (both tabs), cleared
 * on leaving — app HistoryViewSheet
 */
export default function HistoryViewPanel({
	isMovie,
	sort,
	onSort,
	filters,
	onToggleFilter,
	onClearFilters,
	facets,
	facetOptions,
	onToggleGenre,
	onToggleKeyword,
}: Props) {
	const [term, setTerm] = useState("");
	const typed = term.trim().toLowerCase();
	// Picked keywords first, then the most common ones (nothing typed) or the ones matching what's
	// typed — and the typed text itself when no keyword is exactly it
	const keywordChips = useMemo(() => {
		const rest = facetOptions.keywords
			.filter((k) => !facets.keywords.has(k) && (!typed || k.includes(typed)))
			.slice(0, HISTORY_KEYWORD_SUGGESTIONS);
		const exact = !!typed && !facets.keywords.has(typed) && !rest.includes(typed);
		return { picked: [...facets.keywords], rest, exact };
	}, [facetOptions.keywords, facets.keywords, typed]);
	const genres = useMemo(
		() => [...new Set([...facets.genres, ...facetOptions.genres])],
		[facets.genres, facetOptions.genres],
	);
	const anyFilter = filters.size > 0 || facets.genres.size > 0 || facets.keywords.size > 0;
	const genresFull = facets.genres.size >= HISTORY_FACET_MAX;
	const keywordsFull = facets.keywords.size >= HISTORY_FACET_MAX;
	const addTyped = () => {
		if (keywordChips.exact && !keywordsFull) onToggleKeyword(typed);
		setTerm("");
	};
	return (
		<SortPanel options={SORT_OPTIONS} selected={sort} onSelect={onSort} segmented>
			<div className={styles.viewFilterHead}>
				<p className={sortPanelTitleClass}>Filters</p>
				{anyFilter && (
					<button
						className={styles.viewClear}
						onClick={() => {
							onClearFilters();
							setTerm("");
						}}
					>
						Clear all
					</button>
				)}
			</div>
			{!isMovie && <p className={`${styles.facetTitle} ${styles.facetTitleFirst}`}>Status</p>}
			{!isMovie && (
				<div className={styles.viewChips}>
					{HISTORY_FILTERS.map((f) => (
						<Chip
							key={f}
							label={HISTORY_FILTER_LABEL[f]}
							on={filters.has(f)}
							onClick={() => onToggleFilter(f)}
						/>
					))}
				</div>
			)}
			{genres.length > 0 && (
				<>
					<p className={`${styles.facetTitle} ${isMovie ? styles.facetTitleFirst : ""}`}>Genre</p>
					<div className={styles.viewChips}>
						{genres.map((g) => {
							const on = facets.genres.has(g);
							return (
								<Chip
									key={g}
									label={g}
									on={on}
									disabled={!on && genresFull}
									onClick={() => onToggleGenre(g)}
								/>
							);
						})}
					</div>
				</>
			)}
			<p className={styles.facetTitle}>Keyword</p>
			<label className={styles.keywordField}>
				<IoSearch size={16} />
				<input
					value={term}
					onChange={(e) => setTerm(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && addTyped()}
					placeholder="Find a keyword (e.g. time travel)"
					autoCapitalize="none"
					autoCorrect="off"
					aria-label="Find a keyword"
				/>
				{term && (
					<button
						type="button"
						className={styles.keywordClear}
						onClick={() => setTerm("")}
						aria-label="Clear keyword"
					>
						<IoCloseCircle size={18} />
					</button>
				)}
			</label>
			{(keywordChips.picked.length > 0 || keywordChips.rest.length > 0 || keywordChips.exact) && (
				// One sideways-scrolling line: the list changes with every keystroke, the panel's
				// height doesn't
				<div className={styles.chipRow}>
					{keywordChips.exact && (
						<Chip label={typed} on={false} add disabled={keywordsFull} onClick={addTyped} />
					)}
					{keywordChips.picked.map((k) => (
						<Chip key={k} label={k} on onClick={() => onToggleKeyword(k)} />
					))}
					{keywordChips.rest.map((k) => (
						<Chip
							key={k}
							label={k}
							on={false}
							disabled={keywordsFull}
							onClick={() => onToggleKeyword(k)}
						/>
					))}
				</div>
			)}
		</SortPanel>
	);
}
