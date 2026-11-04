import { useMemo, useState } from "react";
import { IoCheckmark, IoChevronDown, IoCloseCircle, IoSearch, IoSparkles } from "react-icons/io5";
import { HISTORY_FACET_MAX, HistoryFilter, HistorySort } from "@app/enums";
import type { HistoryFacets } from "@app/types";
import { titleCase } from "@app/utils/format";
import {
	HISTORY_FILTER_LABEL,
	HISTORY_SORT_LABEL,
	HISTORY_SORTS,
	countryFlag,
	countryName,
	type FacetIndex,
} from "@app/utils/historyView";
import {
	STUDIO_MORE_STEP,
	STUDIO_SUGGESTIONS,
	buildFilterSections,
} from "@app/utils/historyFilterSections";
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
	/** A regional genre typed ("k drama"): turn on its countries + genres together */
	onApplyRegion: (countries: string[], genres: string[]) => void;
	/** Title → facet codes: hides choices no title shares with the picks (null: no narrowing) */
	facetIndex: FacetIndex | null;
	/** Done: closes the panel (picks apply as they're made) — app HistoryViewSheet's Done */
	onDone: () => void;
}

/** One filter chip (status, genre or keyword): a check when on */
function Chip({
	label,
	flag,
	on,
	disabled = false,
	add,
	onClick,
}: {
	label: string;
	/** Country flag, kept apart from the name (app Chip) */
	flag?: string;
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
			{flag && <span aria-hidden>{flag}</span>}
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
	facetIndex,
	onDone,
}: Props) {
	const [term, setTerm] = useState("");
	const [allCountries, setAllCountries] = useState(false);
	const [studioLimit, setStudioLimit] = useState(STUDIO_SUGGESTIONS);
	// Shared with the app sheet: picks stay, dead combinations hide, aliases reveal their chips
	const sections = useMemo(
		() =>
			buildFilterSections({
				term,
				filters,
				facets,
				options: facetOptions,
				index: facetIndex,
				allCountries,
				studioLimit,
			}),
		[term, filters, facets, facetOptions, facetIndex, allCountries, studioLimit],
	);
	const { statuses, genres, countries, moreCountries, studios, moreStudios, region } = sections;
	const keywordChips = {
		...sections.keywords,
		any: sections.keywords.picked.length > 0 || sections.keywords.rest.length > 0 || !!region,
	};
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
		if (!region) return;
		onApplyRegion(region.countries, region.genres);
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
									flag={countryFlag(c)}
									label={countryName(c)}
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
					{region && (
						<Chip
							label={[
								region.alias.label,
								...region.countries.map(countryName),
								...region.genres,
							].join(" · ")}
							on={false}
							add="region"
							onClick={addTyped}
						/>
					)}
					{/* One list (app parity): a toggled keyword keeps its chip and recolours */}
					{[...keywordChips.picked, ...keywordChips.rest].map((k) => {
						const on = facets.keywords.has(k);
						return (
							<Chip
								key={k}
								label={titleCase(k)}
								on={on}
								disabled={!on && keywordsFull}
								onClick={() => onToggleKeyword(k)}
							/>
						);
					})}
				</div>
			)}
			{/* Each pick already applied; Done just closes (app sheet's floating Done) */}
			<div className={styles.viewDoneBar}>
				<button type="button" className={styles.viewDone} onClick={onDone}>
					Done
				</button>
			</div>
		</SortPanel>
	);
}
