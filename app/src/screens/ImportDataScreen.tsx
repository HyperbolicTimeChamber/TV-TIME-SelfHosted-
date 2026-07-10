import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import * as DocumentPicker from "expo-document-picker";
import { useAuthStore } from "../stores/authStore";
import {
  parseGdprZip,
  matchShowsAndMovies,
  importToFirestore,
  ParsedGdprData,
  TMDBMatch,
  AmbiguousMatch,
  ImportStats,
} from "../services/tvtimeImport";
import { colors, spacing, typography, posterSize } from "../theme";

type Phase =
  | "pick"
  | "matching"
  | "disambiguate"
  | "review"
  | "importing"
  | "done";

export default function ImportDataScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const tmdbApiKey = useAuthStore((s) => s.tmdbApiKey);

  const [phase, setPhase] = useState<Phase>("pick");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [statusText, setStatusText] = useState("");

  // Parsed data
  const parsedRef = useRef<ParsedGdprData | null>(null);

  // Match results
  const [matched, setMatched] = useState<TMDBMatch[]>([]);
  const [ambiguous, setAmbiguous] = useState<AmbiguousMatch[]>([]);
  const [unmatchedNames, setUnmatchedNames] = useState<string[]>([]);

  // Disambiguation
  const [disambigIndex, setDisambigIndex] = useState(0);

  // Review selections
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Import stats
  const [importStats, setImportStats] = useState<ImportStats | null>(null);

  // --- Phase 1: Pick file ---
  const handlePickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/zip",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      setPhase("matching");
      setStatusText("Extracting data...");

      const uri = result.assets[0].uri;
      const parsed = await parseGdprZip(uri);
      parsedRef.current = parsed;

      setStatusText("Matching with TMDB...");
      const matchResult = await matchShowsAndMovies(
        tmdbApiKey!,
        parsed.shows,
        parsed.movies,
        (done, total) => setProgress({ done, total })
      );

      setMatched(matchResult.matched);
      setAmbiguous(matchResult.ambiguous);
      setUnmatchedNames(matchResult.unmatched);

      if (matchResult.ambiguous.length > 0) {
        setDisambigIndex(0);
        setPhase("disambiguate");
      } else {
        // Pre-select all matched
        setSelected(new Set(matchResult.matched.map((m) => m.tvTimeName)));
        setPhase("review");
      }
    } catch (err: any) {
      Alert.alert("Import Error", err.message || "Failed to parse zip file.");
      setPhase("pick");
    }
  }, [tmdbApiKey]);

  // --- Phase 2.5: Disambiguation ---
  const handleDisambiguate = useCallback(
    (chosen: TMDBMatch) => {
      setMatched((prev) => [...prev, chosen]);
      const nextIdx = disambigIndex + 1;
      if (nextIdx >= ambiguous.length) {
        // All resolved — move to review
        const allMatched = [...matched, chosen];
        setSelected(new Set(allMatched.map((m) => m.tvTimeName)));
        setPhase("review");
      } else {
        setDisambigIndex(nextIdx);
      }
    },
    [disambigIndex, ambiguous, matched]
  );

  const handleSkipDisambig = useCallback(() => {
    const current = ambiguous[disambigIndex];
    if (current.candidates.length > 0) {
      handleDisambiguate(current.candidates[0]);
    }
  }, [disambigIndex, ambiguous, handleDisambiguate]);

  // --- Phase 3: Review toggle ---
  const toggleSelected = useCallback((tvTimeName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tvTimeName)) next.delete(tvTimeName);
      else next.add(tvTimeName);
      return next;
    });
  }, []);

  // --- Phase 4: Import ---
  const handleImport = useCallback(async () => {
    if (!user || !parsedRef.current) return;
    setPhase("importing");
    setStatusText("Importing...");

    const selectedMatches = matched.filter((m) => selected.has(m.tvTimeName));
    const parsed = parsedRef.current;

    try {
      const stats = await importToFirestore(
        user.uid,
        selectedMatches,
        parsed.shows,
        parsed.watchedEpisodes,
        parsed.rewatchedEpisodes,
        parsed.movies,
        (done, total) => setProgress({ done, total })
      );
      setImportStats(stats);
      setPhase("done");
    } catch (err: any) {
      Alert.alert("Import Error", err.message || "Failed to import data.");
      setPhase("review");
    }
  }, [user, matched, selected]);

  // --- Render phases ---

  if (phase === "pick") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Import TV Time Data</Text>
        <Text style={styles.desc}>
          Select your TV Time GDPR export (.zip) to import your watch history.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={handlePickFile}>
          <Text style={styles.buttonText}>Select ZIP File</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => navigation.goBack?.() || navigation.navigate?.("Main")}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === "matching") {
    return (
      <View style={styles.centered}>
        <Text style={styles.warning}>Do not close the app during import</Text>
        <Text style={styles.title}>{statusText}</Text>
        {progress.total > 0 && (
          <>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(progress.done / progress.total) * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {progress.done} / {progress.total}
            </Text>
          </>
        )}
        <ActivityIndicator
          color={colors.primary}
          size="large"
          style={{ marginTop: spacing.lg }}
        />
      </View>
    );
  }

  if (phase === "disambiguate") {
    const current = ambiguous[disambigIndex];
    return (
      <View style={styles.container}>
        <Text style={styles.warning}>Do not close the app during import</Text>
        <Text style={styles.sectionTitle}>
          Resolve {disambigIndex + 1}/{ambiguous.length}: "{current.tvTimeName}"
        </Text>
        <Text style={styles.desc}>
          Multiple matches found. Pick the correct one:
        </Text>
        <FlatList
          data={current.candidates}
          keyExtractor={(item) => String(item.tmdbId)}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.candidateRow}
              onPress={() => handleDisambiguate(item)}
            >
              {item.posterPath ? (
                <Image
                  source={{ uri: `${posterSize.small}${item.posterPath}` }}
                  style={styles.poster}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.poster, styles.noPoster]}>
                  <Text style={styles.noPosterText}>?</Text>
                </View>
              )}
              <View style={styles.candidateInfo}>
                <Text style={styles.candidateName} numberOfLines={1}>
                  {item.tmdbName}
                </Text>
                <Text style={styles.candidateYear}>{item.year || "N/A"}</Text>
                <Text style={styles.candidateOverview} numberOfLines={2}>
                  {item.overview}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListFooterComponent={
            <TouchableOpacity style={styles.skipButton} onPress={handleSkipDisambig}>
              <Text style={styles.skipText}>Skip (use first result)</Text>
            </TouchableOpacity>
          }
        />
      </View>
    );
  }

  if (phase === "review") {
    const showMatches = matched.filter((m) => m.mediaType === "tv");
    const movieMatches = matched.filter((m) => m.mediaType === "movie");
    const selectedCount = selected.size;
    const episodeCount = parsedRef.current
      ? parsedRef.current.watchedEpisodes.filter((e) => {
          const show = parsedRef.current!.shows.find(
            (s) => s.tvTimeId === e.tvTimeShowId
          );
          return show && selected.has(show.name);
        }).length
      : 0;

    return (
      <View style={styles.container}>
        <FlatList
          data={[...showMatches, ...movieMatches]}
          keyExtractor={(item) => `${item.mediaType}-${item.tmdbId}`}
          ListHeaderComponent={
            <View>
              <Text style={styles.sectionTitle}>
                Review Import ({selectedCount} selected)
              </Text>
              {showMatches.length > 0 && (
                <Text style={styles.subhead}>
                  Shows ({showMatches.filter((m) => selected.has(m.tvTimeName)).length})
                </Text>
              )}
            </View>
          }
          renderItem={({ item, index }) => {
            // Show "Movies" subheader at the transition point from shows to movies
            const isFirstMovie = index === showMatches.length;

            return (
              <>
                {isFirstMovie && showMatches.length > 0 && (
                  <Text style={styles.subhead}>
                    Movies ({movieMatches.filter((m) => selected.has(m.tvTimeName)).length})
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.reviewRow}
                  onPress={() => toggleSelected(item.tvTimeName)}
                >
                  <View
                    style={[
                      styles.checkbox,
                      selected.has(item.tvTimeName) && styles.checkboxChecked,
                    ]}
                  >
                    {selected.has(item.tvTimeName) && (
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
                    <Text style={styles.reviewName} numberOfLines={1}>
                      {item.tmdbName}
                    </Text>
                    <Text style={styles.reviewSub}>
                      {item.tvTimeName !== item.tmdbName
                        ? `"${item.tvTimeName}" → ${item.year}`
                        : item.year}
                    </Text>
                  </View>
                </TouchableOpacity>
              </>
            );
          }}
          ListFooterComponent={
            <View>
              {unmatchedNames.length > 0 && (
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
              )}
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { marginTop: spacing.xl, marginBottom: spacing.xxl * 2 },
                  selectedCount === 0 && styles.buttonDisabled,
                ]}
                onPress={handleImport}
                disabled={selectedCount === 0}
              >
                <Text style={styles.buttonText}>
                  Import {showMatches.filter((m) => selected.has(m.tvTimeName)).length} shows,{" "}
                  {movieMatches.filter((m) => selected.has(m.tvTimeName)).length} movies,{" "}
                  {episodeCount} episodes
                </Text>
              </TouchableOpacity>
            </View>
          }
        />
      </View>
    );
  }

  if (phase === "importing") {
    return (
      <View style={styles.centered}>
        <Text style={styles.warning}>Do not close the app during import</Text>
        <Text style={styles.title}>{statusText}</Text>
        {progress.total > 0 && (
          <>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(progress.done / progress.total) * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {progress.done} / {progress.total}
            </Text>
          </>
        )}
        <ActivityIndicator
          color={colors.primary}
          size="large"
          style={{ marginTop: spacing.lg }}
        />
      </View>
    );
  }

  // phase === "done"
  return (
    <View style={styles.centered}>
      <Text style={styles.title}>Import Complete!</Text>
      {importStats && (
        <View style={styles.statsBox}>
          <Text style={styles.statLine}>
            Shows: {importStats.showsImported}
          </Text>
          <Text style={styles.statLine}>
            Movies: {importStats.moviesImported}
          </Text>
          <Text style={styles.statLine}>
            Episodes: {importStats.episodesImported}
          </Text>
          {importStats.minutesImported > 0 && (
            <Text style={styles.statLine}>
              Watch time: {Math.round(importStats.minutesImported / 60)}h{" "}
              {importStats.minutesImported % 60}m
            </Text>
          )}
          {importStats.skipped > 0 && (
            <Text style={styles.statLine}>
              Skipped (already existed): {importStats.skipped}
            </Text>
          )}
        </View>
      )}
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => navigation.navigate?.("Main") || navigation.goBack?.()}
      >
        <Text style={styles.buttonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  title: {
    ...typography.title,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  desc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.xl,
  },
  warning: {
    ...typography.caption,
    color: colors.destructiveRed,
    textAlign: "center",
    marginBottom: spacing.lg,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionTitle: {
    ...typography.title,
    marginBottom: spacing.md,
  },
  subhead: {
    ...typography.subtitle,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    width: "100%",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.subtitle,
    color: colors.text,
  },
  skipButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  skipText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  progressBar: {
    width: "100%",
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: 3,
    overflow: "hidden",
    marginTop: spacing.lg,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  progressText: {
    ...typography.caption,
    marginTop: spacing.sm,
  },
  // Disambiguation
  candidateRow: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: 4,
  },
  noPoster: {
    backgroundColor: colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  noPosterText: {
    ...typography.title,
    color: colors.textMuted,
  },
  candidateInfo: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: "center",
  },
  candidateName: {
    ...typography.subtitle,
  },
  candidateYear: {
    ...typography.caption,
    marginTop: 2,
  },
  candidateOverview: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  // Review
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.textMuted,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  posterSmall: {
    width: 40,
    height: 60,
    borderRadius: 4,
  },
  reviewInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  reviewName: {
    ...typography.body,
    fontWeight: "600",
  },
  reviewSub: {
    ...typography.caption,
    marginTop: 2,
  },
  unmatchedText: {
    ...typography.body,
    color: colors.textMuted,
    paddingVertical: spacing.xs,
  },
  // Done
  statsBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.xl,
    width: "100%",
    marginBottom: spacing.xl,
  },
  statLine: {
    ...typography.body,
    marginBottom: spacing.sm,
  },
});
