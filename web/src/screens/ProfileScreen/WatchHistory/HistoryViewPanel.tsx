import { useMemo, useState } from "react";
import {
	IoAdd,
	IoCheckmark,
	IoChevronDown,
	IoCloseCircle,
	IoSearch,
	IoSparkles,
} from "react-icons/io5";
import {
	HISTORY_FACET_MAX,
	HISTORY_KEYWORD_SUGGESTIONS,
	HistoryFilter,
	HistorySort,
} from "@app/enums";
import type { HistoryFacets } from "@app/types";
import { titleCase } from "@app/utils/format";
import {
	HISTORY_FILTERS,
	HISTORY_FILTER_LABEL,
	HISTORY_SORT_LABEL,
	HISTORY_SORTS,
	countryLabel,
	regionAliasFor,
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
	facetOptions: { genres: string[]; keywords: string[]; countries: string[] };
	onToggleGenre: (genre: string) => void;
	onToggleKeyword: (keyword: string) => void;
	onToggleCountry: (country: string) => void;
	/** A regional genre typed as a keyword ("k-drama"): turn on its country (+ genre) */
	onApplyRegion: (country: string, genre?: string) => void;
}

/** Countries listed before "More": the most common ones (picked ones always show) */
const COUNTRY_SUGGESTIONS = 8;

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
	/** In place of the check: a typed keyword's plus, a regional genre's sparkle, "More" */
	add?: boolean | "region" | "more";
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
			) : add === "region" ? (
				<IoSparkles size={15} className={styles.chipIcon} />
			) : add === "more" ? (
				<IoChevronDown size={15} className={styles.chipIcon} />
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
	onToggleCountry,
	onApplyRegion,
}: Props) {
	const [term, setTerm] = useState("");
	const typed = term.trim().toLowerCase();
	// Picked keywords first, then the most common ones (nothing typed) or the ones matching what's
	// typed — and the typed text itself when no keyword is exactly it
	const keywordChips = useMemo(() => {
		const rest = facetOptions.keywords
			.filter((k) => !facets.keywords.has(k) && (!typed || k.includes(typed)))
			.slice(0, HISTORY_KEYWORD_SUGGESTIONS);
		// A regional genre (k-drama, anime…) is a country + genre, not a TMDB keyword: its chip
		// takes the place of the typed text's (app HistoryViewSheet)
		const region = typed ? regionAliasFor(typed) : undefined;
		const exact = !region && !!typed && !facets.keywords.has(typed) && !rest.includes(typed);
		return { picked: [...facets.keywords], rest, exact, region };
	}, [facetOptions.keywords, facets.keywords, typed]);
	const [allCountries, setAllCountries] = useState(false);
	const countries = useMemo(
		() => [
			...new Set([
				...facets.countries,
				...(allCountries
					? facetOptions.countries
					: facetOptions.countries.slice(0, COUNTRY_SUGGESTIONS)),
			]),
		],
		[facets.countries, facetOptions.countries, allCountries],
	);
	const moreCountries = !allCountries && facetOptions.countries.length > COUNTRY_SUGGESTIONS;
	const genres = useMemo(
		() => [...new Set([...facets.genres, ...facetOptions.genres])],
		[facets.genres, facetOptions.genres],
	);
	const anyFilter =
		filters.size > 0 ||
		facets.genres.size > 0 ||
		facets.keywords.size > 0 ||
		facets.countries.size > 0;
	const countriesFull = facets.countries.size >= HISTORY_FACET_MAX;
	const genresFull = facets.genres.size >= HISTORY_FACET_MAX;
	const keywordsFull = facets.keywords.size >= HISTORY_FACET_MAX;
	const addTyped = () => {
		if (keywordChips.region) onApplyRegion(keywordChips.region.country, keywordChips.region.genre);
		else if (keywordChips.exact && !keywordsFull) onToggleKeyword(typed);
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
			{countries.length > 0 && (
				<>
					<p className={styles.facetTitle}>Country</p>
					<div className={styles.viewChips}>
						{countries.map((c) => {
							const on = facets.countries.has(c);
							return (
								<Chip
									key={c}
									label={countryLabel(c)}
									on={on}
									disabled={!on && countriesFull}
									onClick={() => onToggleCountry(c)}
								/>
							);
						})}
						{moreCountries && (
							<Chip label="More" on={false} add="more" onClick={() => setAllCountries(true)} />
						)}
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
			{(keywordChips.picked.length > 0 ||
				keywordChips.rest.length > 0 ||
				keywordChips.exact ||
				keywordChips.region) && (
				<div className={styles.viewChips}>
					{keywordChips.region && (
						<Chip
							label={`${keywordChips.region.label} · ${countryLabel(keywordChips.region.country)}`}
							on={false}
							add="region"
							onClick={addTyped}
						/>
					)}
					{keywordChips.exact && (
						<Chip
							label={titleCase(typed)}
							on={false}
							add
							disabled={keywordsFull}
							onClick={addTyped}
						/>
					)}
					{keywordChips.picked.map((k) => (
						<Chip key={k} label={titleCase(k)} on onClick={() => onToggleKeyword(k)} />
					))}
					{keywordChips.rest.map((k) => (
						<Chip
							key={k}
							label={titleCase(k)}
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
