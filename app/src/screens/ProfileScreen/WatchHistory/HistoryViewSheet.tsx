import { useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
	Easing,
	FadeIn,
	FadeOut,
	Keyframe,
	LinearTransition,
} from "react-native-reanimated";
import SortSheet, { sortSheetStyles, type SortOption } from "../../../components/SortSheet";
import {
	HISTORY_FACET_MAX,
	HISTORY_KEYWORD_SUGGESTIONS,
	HistoryFilter,
	HistorySort,
} from "../../../enums";
import type { HistoryFacets } from "../../../types";
import {
	HISTORY_FILTERS,
	HISTORY_FILTER_LABEL,
	HISTORY_SORT_LABEL,
	HISTORY_SORTS,
	countryLabel,
	regionAliasFor,
} from "../../../utils/historyView";
import { colors } from "../../../theme";
import { titleCase } from "../../../utils/format";
import { styles } from "./styles";

const SORT_OPTIONS: SortOption<HistorySort>[] = HISTORY_SORTS.map((value) => ({
	value,
	label: HISTORY_SORT_LABEL[value],
}));

interface Props {
	visible: boolean;
	onClose: () => void;
	isMovie: boolean;
	sort: HistorySort;
	onSort: (sort: HistorySort) => void;
	filters: ReadonlySet<HistoryFilter>;
	onToggleFilter: (filter: HistoryFilter) => void;
	onClearFilters: () => void;
	facets: HistoryFacets;
	/** Every genre / keyword / country across the tab's tracked titles (the user's facets doc) */
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
/** "More" adds this many each tap — the long tail stays reachable by typing its name */
const STUDIO_MORE_STEP = 16;

/** Neighbours glide to their new place when a chip grows / shrinks (its check) or comes and goes,
 *  instead of the row jumping */
const CHIP_REFLOW = LinearTransition.duration(180).easing(Easing.bezier(0.23, 1, 0.32, 1));
/** The check grows in from 60% — never from nothing — and leaves faster than it came */
const CHECK_IN = new Keyframe({
	0: { opacity: 0, transform: [{ scale: 0.6 }] },
	100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.bezier(0.23, 1, 0.32, 1) },
}).duration(160);
const CHECK_OUT = FadeOut.duration(100);

/** One filter chip (status, genre or keyword): a check when on, a selection tick on toggle */
function Chip({
	label,
	on,
	disabled = false,
	icon,
	onPress,
}: {
	label: string;
	on: boolean;
	disabled?: boolean;
	/** In place of the check — e.g. a typed keyword's add */
	icon?: keyof typeof Ionicons.glyphMap;
	onPress: () => void;
}) {
	return (
		<Animated.View layout={CHIP_REFLOW}>
			<Pressable
				style={({ pressed }) => [
					styles.filterChip,
					on && styles.filterChipOn,
					disabled && styles.filterChipDisabled,
					pressed && styles.chipPressed,
				]}
				onPress={() => {
					Haptics.selectionAsync().catch(() => {});
					onPress();
				}}
				disabled={disabled}
				accessibilityRole="button"
				accessibilityState={{ selected: on, disabled }}
			>
				{(on || icon) && (
					<Animated.View entering={CHECK_IN} exiting={CHECK_OUT}>
						<Ionicons name={on ? "checkmark" : icon!} size={16} color={colors.text} />
					</Animated.View>
				)}
				<Text style={[styles.filterChipText, on && styles.filterChipTextOn]}>{label}</Text>
			</Pressable>
		</Animated.View>
	);
}

/** A section's chips, wrapping onto as many lines as they need */
function ChipLine({ children }: { children: ReactNode }) {
	return <View style={styles.chipWrap}>{children}</View>;
}

/**
 * Bottom sheet: sort order (saved) + status filters (TV only) + Genre / Keyword filters (both
 * tabs) — the filters are cleared on leaving
 */
export default function HistoryViewSheet({
	visible,
	onClose,
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
	const [focused, setFocused] = useState(false);
	const typed = term.trim().toLowerCase();
	// The search narrows every section: a chip shows when picked or when its label holds the text
	const shown = (label: string, on: boolean) => on || !typed || label.toLowerCase().includes(typed);
	// Picked keywords first, then the most common ones (nothing typed) or the ones matching what's
	// typed — only keywords the user's titles carry, nothing made up from the typed text
	const keywordChips = useMemo(() => {
		const rest = facetOptions.keywords
			.filter((k) => !facets.keywords.has(k) && (!typed || k.includes(typed)))
			.slice(0, HISTORY_KEYWORD_SUGGESTIONS);
		// A regional genre (k-drama, anime…) is a country + genre, not a TMDB keyword
		const region = typed ? regionAliasFor(typed) : undefined;
		const picked = [...facets.keywords];
		return { picked, rest, region, any: picked.length > 0 || rest.length > 0 || !!region };
	}, [facetOptions.keywords, facets.keywords, typed]);
	const [allCountries, setAllCountries] = useState(false);
	const countries = useMemo(() => {
		const all = [...new Set([...facets.countries, ...facetOptions.countries])];
		// Typing searches every country, not just the first few
		if (typed)
			return all.filter(
				(c) => facets.countries.has(c) || countryLabel(c).toLowerCase().includes(typed),
			);
		return allCountries
			? all
			: [
					...new Set([
						...facets.countries,
						...facetOptions.countries.slice(0, COUNTRY_SUGGESTIONS),
					]),
				];
	}, [facets.countries, facetOptions.countries, allCountries, typed]);
	const moreCountries =
		!typed && !allCountries && facetOptions.countries.length > COUNTRY_SUGGESTIONS;
	const [studioLimit, setStudioLimit] = useState(STUDIO_SUGGESTIONS);
	const studios = useMemo(() => {
		// Typing searches every studio ("disney" → Disney+, Walt Disney…), not just the first few
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
	const statuses = HISTORY_FILTERS.filter((f) => shown(HISTORY_FILTER_LABEL[f], filters.has(f)));
	const anyFilter =
		filters.size > 0 ||
		facets.genres.size > 0 ||
		facets.keywords.size > 0 ||
		facets.countries.size > 0 ||
		facets.studios.size > 0;
	const countriesFull = facets.countries.size >= HISTORY_FACET_MAX;
	const studiosFull = facets.studios.size >= HISTORY_FACET_MAX;
	const applyRegion = () => {
		const region = keywordChips.region;
		if (!region) return;
		onApplyRegion(region.country, region.genre);
		setTerm("");
	};
	const genresFull = facets.genres.size >= HISTORY_FACET_MAX;
	const keywordsFull = facets.keywords.size >= HISTORY_FACET_MAX;
	return (
		<SortSheet
			visible={visible}
			onClose={onClose}
			options={SORT_OPTIONS}
			selected={sort}
			onSelect={onSort}
			segmented
		>
			<View style={styles.sheetFilterHead}>
				<Text style={[sortSheetStyles.title, styles.sheetFilterTitle]}>FILTERS</Text>
				{anyFilter && (
					<Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)}>
						<Pressable
							onPress={() => {
								onClearFilters();
								setTerm("");
							}}
							hitSlop={8}
							accessibilityRole="button"
							style={({ pressed }) => [styles.sheetClear, pressed && styles.chipPressed]}
						>
							<Text style={styles.sheetClearText}>Clear all</Text>
						</Pressable>
					</Animated.View>
				)}
			</View>
			<View style={[styles.keywordField, focused && styles.keywordFieldFocused]}>
				<Ionicons name="search" size={16} color={focused ? colors.text : colors.textSecondary} />
				<TextInput
					style={styles.keywordInput}
					value={term}
					onChangeText={setTerm}
					placeholder="Search filters (e.g. Disney, time travel)"
					placeholderTextColor={colors.textSecondary}
					autoCapitalize="none"
					autoCorrect={false}
					returnKeyType="done"
					onFocus={() => setFocused(true)}
					onBlur={() => setFocused(false)}
					onSubmitEditing={() => {
						if (keywordChips.region) applyRegion();
					}}
					accessibilityLabel="Search filters"
				/>
				{term.length > 0 && (
					<Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(90)}>
						<Pressable
							onPress={() => setTerm("")}
							hitSlop={10}
							accessibilityRole="button"
							accessibilityLabel="Clear search"
							style={({ pressed }) => pressed && styles.chipPressed}
						>
							<Ionicons name="close-circle" size={18} color={colors.textSecondary} />
						</Pressable>
					</Animated.View>
				)}
			</View>
			{!isMovie && statuses.length > 0 && <Text style={styles.facetTitle}>STATUS</Text>}
			{!isMovie && statuses.length > 0 && (
				<View style={styles.chipWrap}>
					{statuses.map((f) => (
						<Chip
							key={f}
							label={HISTORY_FILTER_LABEL[f]}
							on={filters.has(f)}
							onPress={() => onToggleFilter(f)}
						/>
					))}
				</View>
			)}
			{genres.length > 0 && (
				<>
					<Text style={styles.facetTitle}>GENRE</Text>
					<ChipLine>
						{genres.map((g) => {
							const on = facets.genres.has(g);
							return (
								<Chip
									key={g}
									label={g}
									on={on}
									disabled={!on && genresFull}
									onPress={() => onToggleGenre(g)}
								/>
							);
						})}
					</ChipLine>
				</>
			)}
			{countries.length > 0 && (
				<>
					<Text style={styles.facetTitle}>COUNTRY</Text>
					<ChipLine>
						{countries.map((c) => {
							const on = facets.countries.has(c);
							return (
								<Chip
									key={c}
									label={countryLabel(c)}
									on={on}
									disabled={!on && countriesFull}
									onPress={() => onToggleCountry(c)}
								/>
							);
						})}
						{moreCountries && (
							<Chip
								label="More"
								on={false}
								icon="chevron-down"
								onPress={() => setAllCountries(true)}
							/>
						)}
					</ChipLine>
				</>
			)}
			{studios.length > 0 && (
				<>
					<Text style={styles.facetTitle}>STUDIO</Text>
					<ChipLine>
						{studios.map((st) => {
							const on = facets.studios.has(st);
							return (
								<Chip
									key={st}
									label={st}
									on={on}
									disabled={!on && studiosFull}
									onPress={() => onToggleStudio(st)}
								/>
							);
						})}
						{moreStudios && (
							<Chip
								label="More"
								on={false}
								icon="chevron-down"
								onPress={() => setStudioLimit((n) => n + STUDIO_MORE_STEP)}
							/>
						)}
					</ChipLine>
				</>
			)}
			{keywordChips.any && <Text style={styles.facetTitle}>KEYWORD</Text>}
			{keywordChips.any && (
				<ChipLine>
					{keywordChips.region && (
						<Chip
							label={`${keywordChips.region.label} · ${countryLabel(keywordChips.region.country)}`}
							on={false}
							icon="sparkles"
							onPress={applyRegion}
						/>
					)}
					{keywordChips.picked.map((k) => (
						<Chip key={k} label={titleCase(k)} on onPress={() => onToggleKeyword(k)} />
					))}
					{keywordChips.rest.map((k) => (
						<Chip
							key={k}
							label={titleCase(k)}
							on={false}
							disabled={keywordsFull}
							onPress={() => onToggleKeyword(k)}
						/>
					))}
				</ChipLine>
			)}
		</SortSheet>
	);
}
