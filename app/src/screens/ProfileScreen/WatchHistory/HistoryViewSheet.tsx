import { useMemo, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
// Gesture-handler Pressable + the sheet's own text input: inside a Gorhom sheet, React Native's
// Pressable lost a tap whose finger drifted a pixel (Clear all took two taps) and a plain
// TextInput left the keyboard over the sheet (Add to List's fix)
import { Pressable } from "react-native-gesture-handler";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
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
import { HISTORY_FACET_MAX, HistoryFilter, HistorySort } from "../../../enums";
import type { HistoryFacets } from "../../../types";
import {
	HISTORY_FILTER_LABEL,
	HISTORY_SORT_LABEL,
	HISTORY_SORTS,
	countryFlag,
	countryName,
	type FacetIndex,
} from "../../../utils/historyView";
import {
	STUDIO_MORE_STEP,
	STUDIO_SUGGESTIONS,
	buildFilterSections,
} from "../../../utils/historyFilterSections";
import { colors } from "../../../theme";
import { titleCase } from "../../../utils/format";
import { styles } from "./styles";
import { HiCheck } from "../../../components/HiIcons";

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
}

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
	flag,
	on,
	disabled = false,
	icon,
	onPress,
}: {
	label: string;
	/** Country flag, drawn apart from the name: an emoji + text in one Text was measured short
	 *  on Android once the check grew the chip, and the name wrapped out of sight */
	flag?: string;
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
						{on ? (
							<HiCheck size={16} color={colors.onPrimary} />
						) : (
							<Ionicons name={icon!} size={16} color={colors.text} />
						)}
					</Animated.View>
				)}
				{!!flag && <Text style={styles.filterChipFlag}>{flag}</Text>}
				<Text numberOfLines={1} style={[styles.filterChipText, on && styles.filterChipTextOn]}>
					{label}
				</Text>
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
	facetIndex,
}: Props) {
	const [term, setTerm] = useState("");
	const [focused, setFocused] = useState(false);
	const [allCountries, setAllCountries] = useState(false);
	const [studioLimit, setStudioLimit] = useState(STUDIO_SUGGESTIONS);
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
	const { genres, countries, moreCountries, studios, moreStudios, region } = sections;
	const statuses = sections.statuses;
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
	const applyRegion = () => {
		if (!region) return;
		onApplyRegion(region.countries, region.genres);
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
			done
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
				<BottomSheetTextInput
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
						if (region) applyRegion();
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
									flag={countryFlag(c)}
									label={countryName(c)}
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
					{region && (
						<Chip
							label={[
								region.alias.label,
								...region.countries.map(countryName),
								...region.genres,
							].join(" · ")}
							on={false}
							icon="sparkles"
							onPress={applyRegion}
						/>
					)}
					{/* One list, not picked + rest maps: a toggled keyword stays the same chip that
					    recolours, instead of a remount where the old red pill lingered (its check's
					    exit) over the new grey one */}
					{[...keywordChips.picked, ...keywordChips.rest].map((k) => {
						const on = facets.keywords.has(k);
						return (
							<Chip
								key={k}
								label={titleCase(k)}
								on={on}
								disabled={!on && keywordsFull}
								onPress={() => onToggleKeyword(k)}
							/>
						);
					})}
				</ChipLine>
			)}
		</SortSheet>
	);
}
