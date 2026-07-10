import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import LoadingSpinner from "../components/LoadingSpinner";
import * as DocumentPicker from "expo-document-picker";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
} from "@react-native-firebase/firestore";
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

function AnimatedCounter({ target, total }: { target: number; total: number }) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startRef = useRef({ value: 0, time: 0 });

  useEffect(() => {
    if (target === display) return;
    const from = display;
    const duration = Math.min(900, Math.max(300, (target - from) * 20));
    startRef.current = { value: from, time: Date.now() };

    const tick = () => {
      const elapsed = Date.now() - startRef.current.time;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(from + (target - from) * eased);
      setDisplay(current);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target]);

  const pct = total > 0 ? (display / total) * 100 : 0;

  return (
    <>
      <View style={[styles.progressBar, { marginTop: spacing.lg }]}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.progressText}>
        {display} / {total}
      </Text>
    </>
  );
}

function CandidateCard({
  item,
  onPress,
}: {
  item: TMDBMatch;
  onPress: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      style={styles.candidateRow}
      onPress={onPress}
      onLongPress={() => setExpanded((v) => !v)}
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
        <View style={styles.candidateHeader}>
          <Text style={styles.candidateName} numberOfLines={1}>
            {item.tmdbName}
          </Text>
          <View
            style={[
              styles.typeBadge,
              item.mediaType === "movie" && styles.typeBadgeMovie,
            ]}
          >
            <Text style={styles.typeBadgeText}>
              {item.mediaType === "tv" ? "TV" : "MOVIE"}
            </Text>
          </View>
        </View>
        <Text style={styles.candidateYear}>
          {item.year || "N/A"}
          {item.mediaType === "tv" && item.totalEpisodes
            ? ` · ${item.totalEpisodes} episodes`
            : ""}
        </Text>
        <Text
          style={styles.candidateOverview}
          numberOfLines={expanded ? undefined : 2}
        >
          {item.overview || "No description available"}
        </Text>
        {!expanded && (
          <Text style={styles.expandHint}>Long press for full details</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

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

  // Existing watchlist tmdbIds (for duplicate detection)
  const existingIdsRef = useRef<Set<number>>(new Set());

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

      // Fetch existing watchlist IDs to detect duplicates
      if (user) {
        const db = getFirestore();
        const watchlistCol = collection(doc(db, "users", user.uid), "watchlist");
        const snap = await getDocs(watchlistCol);
        const ids = new Set<number>();
        snap.docs.forEach((d) => ids.add(Number(d.id)));
        existingIdsRef.current = ids;
      }

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
        // Pre-select all matched, except duplicates
        const sel = new Set<string>();
        for (const m of matchResult.matched) {
          if (!existingIdsRef.current.has(m.tmdbId)) {
            sel.add(`${m.mediaType}-${m.tmdbId}`);
          }
        }
        setSelected(sel);
        setPhase("review");
      }
    } catch (err: any) {
      Alert.alert("Import Error", err.message || "Failed to parse zip file.");
      setPhase("pick");
    }
  }, [tmdbApiKey, user]);

  // --- Phase 2.5: Disambiguation ---
  const handleDisambiguate = useCallback(
    (chosen: TMDBMatch) => {
      setMatched((prev) => {
        const updated = [...prev, chosen];
        const nextIdx = disambigIndex + 1;
        if (nextIdx >= ambiguous.length) {
          // Pre-select all matched, except duplicates
          const sel = new Set<string>();
          for (const m of updated) {
            if (!existingIdsRef.current.has(m.tmdbId)) {
              sel.add(`${m.mediaType}-${m.tmdbId}`);
            }
          }
          setSelected(sel);
          setPhase("review");
        } else {
          setDisambigIndex(nextIdx);
        }
        return updated;
      });
    },
    [disambigIndex, ambiguous]
  );

  const handleSkipDisambig = useCallback(() => {
    // Skip entirely — don't add this item
    const nextIdx = disambigIndex + 1;
    if (nextIdx >= ambiguous.length) {
      // Pre-select all matched, except duplicates
      const sel = new Set<string>();
      for (const m of matched) {
        if (!existingIdsRef.current.has(m.tmdbId)) {
          sel.add(`${m.mediaType}-${m.tmdbId}`);
        }
      }
      setSelected(sel);
      setPhase("review");
    } else {
      setDisambigIndex(nextIdx);
    }
  }, [disambigIndex, ambiguous, matched]);

  // --- Phase 3: Review toggle ---
  const toggleSelected = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // --- Phase 4: Import ---
  const handleImport = useCallback(async () => {
    if (!user || !parsedRef.current) return;
    setPhase("importing");
    setStatusText("Importing...");

    const selectedMatches = matched.filter((m) =>
      selected.has(`${m.mediaType}-${m.tmdbId}`)
    );
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
        <Text style={styles.title}>{statusText}</Text>
        <View style={{ marginTop: spacing.md }}>
          <LoadingSpinner />
        </View>
        {progress.total > 0 && (
          <AnimatedCounter target={progress.done} total={progress.total} />
        )}
        <Text style={[styles.warning, { marginTop: spacing.xl, marginBottom: 0 }]}>
          Do not close the app during import
        </Text>
      </View>
    );
  }

  if (phase === "disambiguate") {
    const current = ambiguous[disambigIndex];
    return (
      <View style={styles.container}>
        <Text style={styles.sectionTitle}>
          Resolve {disambigIndex + 1}/{ambiguous.length}: "{current.tvTimeName}"
        </Text>
        <Text style={styles.desc}>
          Multiple matches found. Tap to select, long press for details:
        </Text>
        <FlatList
          data={current.candidates}
          keyExtractor={(item) => String(item.tmdbId)}
          renderItem={({ item }) => (
            <CandidateCard
              item={item}
              onPress={() => handleDisambiguate(item)}
            />
          )}
          ListFooterComponent={
            <TouchableOpacity style={styles.skipButton} onPress={handleSkipDisambig}>
              <Text style={styles.skipText}>Skip — don't import this</Text>
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
    const existingIds = existingIdsRef.current;
    const episodeCount = parsedRef.current
      ? parsedRef.current.watchedEpisodes.filter((e) => {
          const show = parsedRef.current!.shows.find(
            (s) => s.tvTimeId === e.tvTimeShowId
          );
          if (!show) return false;
          const match = matched.find(
            (m) => m.tvTimeName === show.name && m.mediaType === "tv"
          );
          return match && selected.has(`tv-${match.tmdbId}`);
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
                  Shows ({showMatches.filter((m) => selected.has(`tv-${m.tmdbId}`)).length})
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
                    Movies ({movieMatches.filter((m) => selected.has(`movie-${m.tmdbId}`)).length})
                  </Text>
                )}
                <TouchableOpacity
                  style={[styles.reviewRow, isDuplicate && styles.reviewRowDuplicate]}
                  onPress={() => toggleSelected(key)}
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
                    <Text style={styles.reviewName} numberOfLines={1}>
                      {item.tmdbName}
                    </Text>
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
                  Import {showMatches.filter((m) => selected.has(`tv-${m.tmdbId}`)).length} shows,{" "}
                  {movieMatches.filter((m) => selected.has(`movie-${m.tmdbId}`)).length} movies,{" "}
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
        <Text style={styles.title}>{statusText}</Text>
        <View style={{ marginTop: spacing.md }}>
          <LoadingSpinner />
        </View>
        {progress.total > 0 && (
          <AnimatedCounter target={progress.done} total={progress.total} />
        )}
        <Text style={[styles.warning, { marginTop: spacing.xl, marginBottom: 0 }]}>
          Do not close the app during import
        </Text>
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
  candidateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
    flex: 1,
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
  expandHint: {
    ...typography.caption,
    color: colors.primary,
    marginTop: spacing.xs,
    fontSize: 10,
  },
  typeBadge: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeBadgeMovie: {
    backgroundColor: "#8B5CF6",
  },
  typeBadgeText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: "700",
  },
  // Review
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  reviewRowDuplicate: {
    opacity: 0.5,
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
  duplicateBadge: {
    ...typography.caption,
    color: "#F59E0B",
    fontWeight: "600",
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
