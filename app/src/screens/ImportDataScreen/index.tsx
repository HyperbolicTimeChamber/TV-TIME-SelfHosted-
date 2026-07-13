import React, { useState, useCallback, useRef, useEffect } from "react";
import { Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
} from "@react-native-firebase/firestore";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { useAuthStore } from "../../stores/authStore";
import {
  parseGdprZip,
  matchShowsAndMovies,
  searchTMDBPage,
  ParsedGdprData,
  ParsedShow,
  TMDBMatch,
  AmbiguousMatch,
  ImportStats,
} from "../../services/tvtimeImport";
import PickPhase from "./PickPhase";
import ProgressPhase from "./ProgressPhase";
import DisambiguatePhase from "./DisambiguatePhase";
import ReviewPhase from "./ReviewPhase";
import DonePhase from "./DonePhase";

type Phase = "pick" | "matching" | "disambiguate" | "review" | "importing" | "done";

export default function ImportDataScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const tmdbApiKey = useAuthStore((s) => s.appTmdbApiKey);

  const [phase, setPhase] = useState<Phase>("pick");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [statusText, setStatusText] = useState("");

  const parsedRef = useRef<ParsedGdprData | null>(null);
  const [matched, setMatched] = useState<TMDBMatch[]>([]);
  const [ambiguous, setAmbiguous] = useState<AmbiguousMatch[]>([]);
  const [unmatchedNames, setUnmatchedNames] = useState<string[]>([]);
  const [disambigIndex, setDisambigIndex] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const existingIdsRef = useRef<Set<number>>(new Set());
  const [importStats, setImportStats] = useState<ImportStats | null>(null);

  // Disambiguation pagination
  const [disambigCandidates, setDisambigCandidates] = useState<TMDBMatch[]>([]);
  const disambigPageRef = useRef(1);
  const disambigTotalPagesRef = useRef(1);
  const [loadingMore, setLoadingMore] = useState(false);

  // Disambiguation history for back navigation
  const disambigHistory = useRef<({ type: "pick"; match: TMDBMatch } | { type: "skip" })[]>([]);

  // --- Helpers ---
  const buildSelection = useCallback((matches: TMDBMatch[]) => {
    const sel = new Set<string>();
    for (const m of matches) {
      if (!existingIdsRef.current.has(m.tmdbId)) {
        sel.add(`${m.mediaType}-${m.tmdbId}`);
      }
    }
    return sel;
  }, []);

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

      if (user) {
        const db = getFirestore();
        const watchlistCol = collection(doc(db, "users", user.uid), "tracking");
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
        setSelected(buildSelection(matchResult.matched));
        setPhase("review");
      }
    } catch (err: any) {
      Alert.alert("Import Error", err.message || "Failed to parse zip file.");
      setPhase("pick");
    }
  }, [tmdbApiKey, user, buildSelection]);

  // --- Sync candidates when disambig index changes ---
  useEffect(() => {
    if (phase === "disambiguate" && ambiguous.length > 0 && disambigIndex < ambiguous.length) {
      setDisambigCandidates(ambiguous[disambigIndex].candidates);
      disambigPageRef.current = 1;
      disambigTotalPagesRef.current = 99;
    }
  }, [phase, disambigIndex, ambiguous]);

  const loadMoreCandidates = useCallback(async () => {
    if (loadingMore || disambigPageRef.current >= disambigTotalPagesRef.current) return;
    if (!tmdbApiKey || disambigIndex >= ambiguous.length) return;
    setLoadingMore(true);
    const current = ambiguous[disambigIndex];
    const nextPage = disambigPageRef.current + 1;
    const { results, totalPages } = await searchTMDBPage(
      tmdbApiKey,
      current.tvTimeName,
      current.mediaType,
      nextPage
    );
    disambigPageRef.current = nextPage;
    disambigTotalPagesRef.current = totalPages;
    if (results.length > 0) {
      setDisambigCandidates((prev) => {
        const existing = new Set(prev.map((c) => c.tmdbId));
        return [...prev, ...results.filter((r) => !existing.has(r.tmdbId))];
      });
    }
    setLoadingMore(false);
  }, [loadingMore, tmdbApiKey, disambigIndex, ambiguous]);

  // --- Disambiguation handlers ---
  const finishDisambig = useCallback(
    (currentMatched: TMDBMatch[]) => {
      setSelected(buildSelection(currentMatched));
      setPhase("review");
    },
    [buildSelection]
  );

  const handleDisambiguate = useCallback(
    (chosen: TMDBMatch) => {
      disambigHistory.current[disambigIndex] = { type: "pick", match: chosen };
      setMatched((prev) => {
        const updated = [...prev, chosen];
        if (disambigIndex + 1 >= ambiguous.length) {
          finishDisambig(updated);
        } else {
          setDisambigIndex(disambigIndex + 1);
        }
        return updated;
      });
    },
    [disambigIndex, ambiguous, finishDisambig]
  );

  const handleSkipDisambig = useCallback(() => {
    disambigHistory.current[disambigIndex] = { type: "skip" };
    if (disambigIndex + 1 >= ambiguous.length) {
      finishDisambig(matched);
    } else {
      setDisambigIndex(disambigIndex + 1);
    }
  }, [disambigIndex, ambiguous, matched, finishDisambig]);

  const handleBackDisambig = useCallback(() => {
    if (disambigIndex <= 0) return;
    const prevIdx = disambigIndex - 1;
    const prevAction = disambigHistory.current[prevIdx];
    if (prevAction?.type === "pick") {
      setMatched((prev) => prev.filter((m) => m !== prevAction.match));
    }
    disambigHistory.current.length = prevIdx;
    setDisambigIndex(prevIdx);
  }, [disambigIndex]);

  // --- Review toggle ---
  const toggleSelected = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // --- Import via Cloud Function ---
  const handleImport = useCallback(async () => {
    if (!user || !parsedRef.current) return;
    setPhase("importing");
    setProgress({ done: 0, total: 0 });
    setStatusText("Importing data...");

    const selectedMatches = matched.filter((m) =>
      selected.has(`${m.mediaType}-${m.tmdbId}`)
    );
    const parsed = parsedRef.current;

    // Build show lookup by tvTimeId for status derivation
    const showByTvTimeId = new Map<number, ParsedShow>();
    for (const s of parsed.shows) {
      showByTvTimeId.set(s.tvTimeId, s);
    }

    function deriveStatus(show: ParsedShow): string {
      if (show.isArchived) return "completed";
      if (show.isForLater) return "plan_to_watch";
      return "watching";
    }

    // Transform matches to CF format
    const cfMatches = selectedMatches.map((m) => {
      if (m.mediaType === "tv") {
        const show = m.tvTimeId !== undefined
          ? showByTvTimeId.get(m.tvTimeId)
          : parsed.shows.find((s) => s.name === m.tvTimeName);

        // Collect watched episodes for this show
        const showEps = m.tvTimeId !== undefined
          ? parsed.watchedEpisodes.filter((e) => e.tvTimeShowId === m.tvTimeId)
          : [];
        const rewatchEps = m.tvTimeId !== undefined
          ? parsed.rewatchedEpisodes.filter((e) => e.tvTimeShowId === m.tvTimeId)
          : [];

        return {
          tmdbId: m.tmdbId,
          mediaType: m.mediaType,
          tmdbName: m.tmdbName,
          posterPath: m.posterPath,
          totalEpisodes: m.totalEpisodes,
          status: show ? deriveStatus(show) : "watching",
          followedAt: show?.followedAt || null,
          rewatchCount: show?.rewatchCount || 0,
          watchedEpisodes: showEps.map((e) => ({
            season: e.season,
            episode: e.episode,
            watchedAt: e.watchedAt,
          })),
          rewatchedEpisodes: rewatchEps.map((e) => ({
            season: e.season,
            episode: e.episode,
            watchedAt: e.watchedAt,
          })),
        };
      } else {
        const movie = parsed.movies.find((mv) => mv.name === m.tvTimeName);
        return {
          tmdbId: m.tmdbId,
          mediaType: m.mediaType,
          tmdbName: m.tmdbName,
          posterPath: m.posterPath,
          totalEpisodes: m.totalEpisodes,
          status: "completed",
          movieWatchedAt: movie?.watchedAt || null,
          movieRuntime: movie ? Math.round(movie.runtimeSeconds / 60) : undefined,
        };
      }
    });

    try {
      const functions = getFunctions();
      const importFn = httpsCallable<{ matches: typeof cfMatches }, ImportStats>(
        functions,
        "importMatches"
      );
      const result = await importFn({ matches: cfMatches });
      setImportStats(result.data);
      setPhase("done");
    } catch (err: any) {
      Alert.alert("Import Error", err.message || "Failed to import data.");
      setPhase("review");
    }
  }, [user, matched, selected]);

  // --- Render ---
  const insetTop = insets.top;

  if (phase === "pick") {
    return (
      <PickPhase
        insetTop={insetTop}
        onPickFile={handlePickFile}
        onSkip={() => navigation.goBack?.() || navigation.navigate?.("Main")}
      />
    );
  }

  if (phase === "matching" || phase === "importing") {
    return (
      <ProgressPhase
        insetTop={insetTop}
        statusText={statusText}
        progress={progress}
      />
    );
  }

  if (phase === "disambiguate") {
    return (
      <DisambiguatePhase
        insetTop={insetTop}
        current={ambiguous[disambigIndex]}
        disambigIndex={disambigIndex}
        totalAmbiguous={ambiguous.length}
        candidates={disambigCandidates}
        loadingMore={loadingMore}
        onSelect={handleDisambiguate}
        onSkip={handleSkipDisambig}
        onBack={handleBackDisambig}
        onLoadMore={loadMoreCandidates}
      />
    );
  }

  if (phase === "review" && parsedRef.current) {
    return (
      <ReviewPhase
        insetTop={insetTop}
        matched={matched}
        selected={selected}
        existingIds={existingIdsRef.current}
        unmatchedNames={unmatchedNames}
        parsed={parsedRef.current}
        onToggle={toggleSelected}
        onImport={handleImport}
      />
    );
  }

  if (phase === "done" && importStats) {
    return (
      <DonePhase
        insetTop={insetTop}
        stats={importStats}
        onDone={() => navigation.navigate?.("Main") || navigation.goBack?.()}
      />
    );
  }

  return null;
}
