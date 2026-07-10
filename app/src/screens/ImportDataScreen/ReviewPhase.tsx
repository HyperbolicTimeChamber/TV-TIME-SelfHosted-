import React from "react";
import { View, Text, TouchableOpacity, FlatList } from "react-native";
import { Image } from "expo-image";
import { TMDBMatch, ParsedGdprData } from "../../services/tvtimeImport";
import { spacing, posterSize } from "../../theme";
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
}

export default function ReviewPhase({
  insetTop,
  matched,
  selected,
  existingIds,
  unmatchedNames,
  parsed,
  onToggle,
  onImport,
}: Props) {
  const showMatches = matched.filter((m) => m.mediaType === "tv");
  const movieMatches = matched.filter((m) => m.mediaType === "movie");
  const selectedCount = selected.size;

  const episodeCount = parsed.watchedEpisodes.filter((e) => {
    const show = parsed.shows.find((s) => s.tvTimeId === e.tvTimeShowId);
    if (!show) return false;
    const match = matched.find(
      (m) => m.tvTimeName === show.name && m.mediaType === "tv"
    );
    return match && selected.has(`tv-${match.tmdbId}`);
  }).length;

  const selectedShows = showMatches.filter((m) => selected.has(`tv-${m.tmdbId}`)).length;
  const selectedMovies = movieMatches.filter((m) => selected.has(`movie-${m.tmdbId}`)).length;

  return (
    <View style={[styles.container, { paddingTop: insetTop + spacing.lg }]}>
      <FlatList
        data={[...showMatches, ...movieMatches]}
        keyExtractor={(item) => `${item.mediaType}-${item.tmdbId}`}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <View>
            <Text style={styles.sectionTitle}>
              Review Import ({selectedCount} selected)
            </Text>
            {showMatches.length > 0 && (
              <Text style={styles.subhead}>
                Shows ({selectedShows})
              </Text>
            )}
          </View>
        }
        renderItem={({ item, index }) => {
          const key = `${item.mediaType}-${item.tmdbId}`;
          const isDuplicate = existingIds.has(item.tmdbId);
          const isFirstMovie = index === showMatches.length;

          return (
            <>
              {isFirstMovie && showMatches.length > 0 && (
                <Text style={styles.subhead}>
                  Movies ({selectedMovies})
                </Text>
              )}
              <TouchableOpacity
                style={[styles.reviewRow, isDuplicate && styles.reviewRowDuplicate]}
                onPress={() => onToggle(key)}
              >
                <View
                  style={[
                    styles.checkbox,
                    selected.has(key) && styles.checkboxChecked,
                  ]}
                >
                  {selected.has(key) && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </View>
                {item.posterPath ? (
                  <Image
                    source={{ uri: `${posterSize.small}${item.posterPath}` }}
                    style={styles.posterSmall}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.posterSmall, styles.noPoster]}>
                    <Text style={styles.noPosterText}>?</Text>
                  </View>
                )}
                <View style={styles.reviewInfo}>
                  <Text style={styles.reviewName}>{item.tmdbName}</Text>
                  <Text style={styles.reviewSub}>
                    {item.tvTimeName !== item.tmdbName
                      ? `"${item.tvTimeName}" → ${item.year}`
                      : item.year}
                  </Text>
                  {isDuplicate && (
                    <Text style={styles.duplicateBadge}>Already in watchlist</Text>
                  )}
                </View>
              </TouchableOpacity>
            </>
          );
        }}
        ListFooterComponent={
          unmatchedNames.length > 0 ? (
            <View style={{ marginTop: spacing.lg }}>
              <Text style={styles.subhead}>
                Unmatched ({unmatchedNames.length})
              </Text>
              {unmatchedNames.map((n) => (
                <Text key={n} style={styles.unmatchedText}>
                  {n}
                </Text>
              ))}
            </View>
          ) : null
        }
      />

      {/* Fixed footer */}
      <View style={styles.reviewFooter}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            selectedCount === 0 && styles.buttonDisabled,
          ]}
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
