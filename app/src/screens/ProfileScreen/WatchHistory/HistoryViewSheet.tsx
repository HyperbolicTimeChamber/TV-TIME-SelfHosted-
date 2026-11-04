import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Keyboard, Platform, Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
} from "../../../utils/historyView";
import { colors } from "../../../theme";
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
	/** Every genre / keyword across the tab's tracked titles (the user's facets doc) */
	facetOptions: { genres: string[]; keywords: string[] };
	onToggleGenre: (genre: string) => void;
	onToggleKeyword: (keyword: string) => void;
}

/** Keyboard height while it's up — the sheet grows by it so the keyword field stays in sight */
function useKeyboardHeight() {
	const [height, setHeight] = useState(0);
	useEffect(() => {
		const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
		const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
		const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates.height));
		const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
		return () => {
			show.remove();
			hide.remove();
		};
	}, []);
	return height;
}

/** One filter chip (status, genre or keyword): a check when on */
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
		<Pressable
			style={({ pressed }) => [
				styles.filterChip,
				on && styles.filterChipOn,
				disabled && styles.filterChipDisabled,
				pressed && styles.chipPressed,
			]}
			onPress={onPress}
			disabled={disabled}
			accessibilityRole="button"
			accessibilityState={{ selected: on, disabled }}
		>
			{(on || icon) && <Ionicons name={on ? "checkmark" : icon!} size={16} color={colors.text} />}
			<Text style={[styles.filterChipText, on && styles.filterChipTextOn]}>{label}</Text>
		</Pressable>
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
}: Props) {
	const keyboard = useKeyboardHeight();
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
	return (
		<SortSheet
			visible={visible}
			onClose={onClose}
			options={SORT_OPTIONS}
			selected={sort}
			onSelect={onSort}
		>
			<View style={styles.sheetFilterHead}>
				<Text style={[sortSheetStyles.title, styles.sheetFilterTitle]}>FILTER</Text>
				{anyFilter && (
					<Pressable
						onPress={() => {
							onClearFilters();
							setTerm("");
						}}
						hitSlop={8}
						accessibilityRole="button"
						style={({ pressed }) => [styles.sheetClear, pressed && styles.chipPressed]}
					>
						<Text style={styles.sheetClearText}>Clear</Text>
					</Pressable>
				)}
			</View>
			{!isMovie && (
				<View style={styles.chipWrap}>
					{HISTORY_FILTERS.map((f) => (
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
					<Text style={styles.facetTitle}>Genre</Text>
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
			<Text style={styles.facetTitle}>Keyword</Text>
			<View style={styles.keywordField}>
				<Ionicons name="search" size={16} color={colors.textSecondary} />
				<TextInput
					style={styles.keywordInput}
					value={term}
					onChangeText={setTerm}
					placeholder="Find a keyword (e.g. time travel)"
					placeholderTextColor={colors.textSecondary}
					autoCapitalize="none"
					autoCorrect={false}
					returnKeyType="done"
					onSubmitEditing={() => {
						if (keywordChips.exact && !keywordsFull) onToggleKeyword(typed);
						setTerm("");
					}}
					accessibilityLabel="Find a keyword"
				/>
			</View>
			{(keywordChips.picked.length > 0 ||
				keywordChips.rest.length > 0 ||
				keywordChips.exact) && (
				<ChipLine>
					{keywordChips.exact && (
						<Chip
							label={typed}
							on={false}
							icon="add"
							disabled={keywordsFull}
							onPress={() => {
								onToggleKeyword(typed);
								setTerm("");
							}}
						/>
					)}
					{keywordChips.picked.map((k) => (
						<Chip key={k} label={k} on onPress={() => onToggleKeyword(k)} />
					))}
					{keywordChips.rest.map((k) => (
						<Chip
							key={k}
							label={k}
							on={false}
							disabled={keywordsFull}
							onPress={() => onToggleKeyword(k)}
						/>
					))}
				</ChipLine>
			)}
			{/* Keyboard up: the sheet grows by its height, the field stays above it */}
			<View style={{ height: keyboard }} />
		</SortSheet>
	);
}
