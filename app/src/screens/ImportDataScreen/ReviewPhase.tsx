import React, { useMemo, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { LegendList } from "@legendapp/list/react-native";
import { Image } from "expo-image";
import { TMDBMatch, ParsedGdprData } from "../../services/tvtimeImport";
import { spacing } from "../../theme";
import { tmdbPosterUri } from "../../hooks/useTmdbImage";
import { importStyles as styles } from "./styles";

interface Props {
	insetTop: number;
	matched: TMDBMatch[];
	selected: Set<string>;
	existingIds: Set<number>;
	unmatchedNames: string[];
	parsed: ParsedGdprData;
	onToggle: (key: string) => void;
	onImport: () => void;
	onBack?: () => void;
}

type ListItem =
	| { type: "sectionHeader"; label: string; key: string }
	| { type: "match"; match: TMDBMatch; key: string }
	| { type: "unmatched"; name: string; key: string };

export default function ReviewPhase({
	insetTop,
	matched,
	selected,
	existingIds,
	unmatchedNames,
	parsed,
	onToggle,
	onImport,
	onBack,
}: Props) {
	const listData = useMemo(() => {
		const seen = new Set<string>();
		const shows: TMDBMatch[] = [];
		const movies: TMDBMatch[] = [];
		for (const m of matched) {
			const key = `${m.mediaType}-${m.tmdbId}`;
			if (seen.has(key)) continue;
			seen.add(key);
			if (m.mediaType === "tv") shows.push(m);
			else movies.push(m);
		}

		const items: ListItem[] = [];
		if (shows.length > 0) {
			items.push({
				type: "sectionHeader",
				label: "Shows",
				key: "header-shows",
			});
			for (const s of shows) items.push({ type: "match", match: s, key: `tv-${s.tmdbId}` });
		}
		if (movies.length > 0) {
			items.push({
				type: "sectionHeader",
				label: "Movies",
				key: "header-movies",
			});
			for (const m of movies) items.push({ type: "match", match: m, key: `movie-${m.tmdbId}` });
		}
		if (unmatchedNames.length > 0) {
			items.push({
				type: "sectionHeader",
				label: `Unmatched (${unmatchedNames.length})`,
				key: "header-unmatched",
			});
			const seenNames = new Set<string>();
			for (const n of unmatchedNames) {
				const nKey = seenNames.has(n) ? `un-${n}-${seenNames.size}` : `un-${n}`;
				seenNames.add(n);
				items.push({ type: "unmatched", name: n, key: nKey });
			}
		}
		return items;
	}, [matched, unmatchedNames]);

	const selectedShows = useMemo(
		() => matched.filter((m) => m.mediaType === "tv" && selected.has(`tv-${m.tmdbId}`)).length,
		[matched, selected],
	);

	const selectedMovies = useMemo(
		() =>
			matched.filter((m) => m.mediaType === "movie" && selected.has(`movie-${m.tmdbId}`)).length,
		[matched, selected],
	);

	const episodeCount = useMemo(() => {
		const tvTimeIdToSelected = new Map<number, boolean>();
		for (const m of matched) {
			if (m.mediaType === "tv" && m.tvTimeId !== undefined && selected.has(`tv-${m.tmdbId}`)) {
				tvTimeIdToSelected.set(m.tvTimeId, true);
			}
		}
		let count = 0;
		for (const ep of parsed.watchedEpisodes) {
			if (tvTimeIdToSelected.has(ep.tvTimeShowId)) count++;
		}
		return count;
	}, [matched, selected, parsed.watchedEpisodes]);

	const selectedCount = selected.size;

	const renderItem = useCallback(
		({ item }: { item: ListItem }) => {
			if (item.type === "sectionHeader") {
				return <Text style={styles.subhead}>{item.label}</Text>;
			}
			if (item.type === "unmatched") {
				return <Text style={styles.unmatchedText}>{item.name}</Text>;
			}
			const m = item.match;
			const key = `${m.mediaType}-${m.tmdbId}`;
			const isSelected = selected.has(key);
			const isDuplicate = existingIds.has(m.tmdbId);
			return (
				<TouchableOpacity
					style={[styles.reviewRow, isDuplicate && styles.reviewRowDuplicate]}
					onPress={() => onToggle(key)}
				>
					<View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
						{isSelected && <Text style={styles.checkmark}>✓</Text>}
					</View>
					{m.posterPath ? (
						<Image
							source={{ uri: tmdbPosterUri(m.posterPath, 40) }}
							style={styles.posterSmall}
							contentFit="cover"
						/>
					) : (
						<View style={[styles.posterSmall, styles.noPoster]}>
							<Text style={styles.noPosterText}>?</Text>
						</View>
					)}
					<View style={styles.reviewInfo}>
						<Text style={styles.reviewName}>{m.tmdbName}</Text>
						<Text style={styles.reviewSub}>
							{m.tvTimeName !== m.tmdbName ? `"${m.tvTimeName}" \u2192 ${m.year}` : m.year}
						</Text>
						{isDuplicate && <Text style={styles.duplicateBadge}>Already in watchlist</Text>}
					</View>
				</TouchableOpacity>
			);
		},
		[selected, existingIds, onToggle],
	);

	return (
		<View style={[styles.container, { paddingTop: insetTop + spacing.lg }]}>
			<Text style={styles.sectionTitle}>Review Import ({selectedCount} selected)</Text>

			<LegendList
				data={listData}
				keyExtractor={(item) => item.key}
				renderItem={renderItem}
				extraData={selected}
				contentContainerStyle={{ paddingBottom: 100 }}
			/>

			<View style={styles.reviewFooter}>
				{onBack && (
					<TouchableOpacity style={styles.backButton} onPress={onBack}>
						<Text style={styles.backButtonText}>← Back</Text>
					</TouchableOpacity>
				)}
				<TouchableOpacity
					style={[styles.primaryButton, selectedCount === 0 && styles.buttonDisabled]}
					onPress={onImport}
					disabled={selectedCount === 0}
				>
					<Text style={styles.buttonText}>
						Import {selectedShows} shows, {selectedMovies} movies, {episodeCount} episodes
					</Text>
				</TouchableOpacity>
			</View>
		</View>
	);
}
