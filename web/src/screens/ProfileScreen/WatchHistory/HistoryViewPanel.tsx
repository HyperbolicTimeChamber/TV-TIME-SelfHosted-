import { useMemo, useState } from "react";
import { IoCheckmark, IoChevronDown, IoCloseCircle, IoSearch, IoSparkles } from "react-icons/io5";
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
	/** Every genre / keyword / country / studio across the tab's tracked titles (the user's facets doc) */
	facetOptions: { genres: string[]; keywords: string[]; countries: string[]; studios: string[] };
	onToggleGenre: (genre: string) => void;
	onToggleKeyword: (keyword: string) => void;
	onToggleCountry: (country: string) => void;
	onToggleStudio: (studio: string) => void;
	/** A regional genre typed as a keyword ("k-drama"): turn on its country (+ genre) */
	onApplyRegion: (country: string, genre?: string) => void;
}

/** Countries / studios listed before "More": the most common ones (picked ones always show) */
const COUNTRY_SUGGESTIONS = 8;
const STUDIO_SUGGESTIONS = 8;
/** "More" adds this many studios each click — the long tail stays reachable by typing its name */
const STUDIO_MORE_STEP = 16;

/** One filter chip (status, genre or keyword): a check when on */
function Chip({
	label,
	on,
	disabled = false,
	add,
	onClick,
}: {
	label: string;
	on: boolean;
	disabled?: boolean;
	/** In place of the check: a regional genre's sparkle, "More" */
	add?: "region" | "more";
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
	onToggleStudio,
	onApplyRegion,
}: Props) {
	const [term, setTerm] = useState("");
	const typed = term.trim().toLowerCase();
	// Picked keywords first, then the most common ones (nothing typed) or the ones matching what's
	// typed — only keywords the user's titles carry, nothing made up from the typed text
	const keywordChips = useMemo(() => {
		const rest = facetOptions.keywords
			.filter((k) => !facets.keywords.has(k) && (!typed || k.includes(typed)))
			.slice(0, HISTORY_KEYWORD_SUGGESTIONS);
		// A regional genre (k-drama, anime…) is a country + genre, not a TMDB keyword (app HistoryViewSheet)
		const region = typed ? regionAliasFor(typed) : undefined;
		const picked = [...facets.keywords];
		return { picked, rest, region, any: picked.length > 0 || rest.length > 0 || !!region };
	}, [facetOptions.keywords, facets.keywords, typed]);
	const [allCountries, setAllCountries] = useState(false);
	// The search narrows every section (app HistoryViewSheet): a chip shows when picked or when its
	// label holds the text — typing searches every country / studio, not just the first few
	const countries = useMemo(() => {
		if (typed)
			return [...new Set([...facets.countries, ...facetOptions.countries])].filter(
				(c) => facets.countries.has(c) || countryLabel(c).toLowerCase().includes(typed),
			);
		return [
			...new Set([
				...facets.countries,
				...(allCountries
					? facetOptions.countries
					: facetOptions.countries.slice(0, COUNTRY_SUGGESTIONS)),
			]),
		];
	}, [facets.countries, facetOptions.countries, allCountries, typed]);
	const moreCountries =
		!typed && !allCountries && facetOptions.countries.length > COUNTRY_SUGGESTIONS;
	const [studioLimit, setStudioLimit] = useState(STUDIO_SUGGESTIONS);
	const studios = useMemo(() => {
		if (typed)
			return [...new Set([...facets.studios, ...facetOptions.studios])].filter(
				(st) => facets.studios.has(st) || st.toLowerCase().includes(typed),
			);
		return [...new Set([...facets.studios, ...facetOptions.studios.slice(0, studioLimit)])];
	}, [facets.studios, facetOptions.studios, studioLimit, typed]);
	const moreStudios = !typed && facetOptions.studios.length > studioLimit;
	const genres = useMemo(
		() =>
			[...new Set([...facets.genres, ...facetOptions.genres])].filter(
				(g) => facets.genres.has(g) || !typed || g.toLowerCase().includes(typed),
			),
		[facets.genres, facetOptions.genres, typed],
	);
	const statuses = HISTORY_FILTERS.filter(
		(f) => filters.has(f) || !typed || HISTORY_FILTER_LABEL[f].toLowerCase().includes(typed),
	);
	const anyFilter =
		filters.size > 0 ||
		facets.genres.size > 0 ||
		facets.keywords.size > 0 ||
		facets.countries.size > 0 ||
		facets.studios.size > 0;
	const countriesFull = facets.countries.size >= HISTORY_FACET_MAX;
	const studiosFull = facets.studios.size >= HISTORY_FACET_MAX;
	const genresFull = facets.genres.size >= HISTORY_FACET_MAX;
	const keywordsFull = facets.keywords.size >= HISTORY_FACET_MAX;
	const addTyped = () => {
		if (!keywordChips.region) return;
		onApplyRegion(keywordChips.region.country, keywordChips.region.genre);
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
			<label className={styles.keywordField}>
				<IoSearch size={16} />
				<input
					value={term}
					onChange={(e) => setTerm(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && addTyped()}
					placeholder="Search filters (e.g. Disney, time travel)"
					autoCapitalize="none"
					autoCorrect="off"
					aria-label="Search filters"
				/>
				{term && (
					<button
						type="button"
						className={styles.keywordClear}
						onClick={() => setTerm("")}
						aria-label="Clear search"
					>
						<IoCloseCircle size={18} />
					</button>
				)}
			</label>
			{!isMovie && statuses.length > 0 && <p className={styles.facetTitle}>Status</p>}
			{!isMovie && statuses.length > 0 && (
				<div className={styles.viewChips}>
					{statuses.map((f) => (
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
					<p className={styles.facetTitle}>Genre</p>
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
			{studios.length > 0 && (
				<>
					<p className={styles.facetTitle}>Studio</p>
					<div className={styles.viewChips}>
						{studios.map((st) => {
							const on = facets.studios.has(st);
							return (
								<Chip
									key={st}
									label={st}
									on={on}
									disabled={!on && studiosFull}
									onClick={() => onToggleStudio(st)}
								/>
							);
						})}
						{moreStudios && (
							<Chip
								label="More"
								on={false}
								add="more"
								onClick={() => setStudioLimit((n) => n + STUDIO_MORE_STEP)}
							/>
						)}
					</div>
				</>
			)}
			{keywordChips.any && <p className={styles.facetTitle}>Keyword</p>}
			{keywordChips.any && (
				<div className={styles.viewChips}>
					{keywordChips.region && (
						<Chip
							label={`${keywordChips.region.label} · ${countryLabel(keywordChips.region.country)}`}
							on={false}
							add="region"
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
