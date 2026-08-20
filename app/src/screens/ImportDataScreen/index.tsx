import React, { useState, useCallback, useRef, useEffect } from "react";
import { Alert, View, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { getFirestore, collection, doc, getDocs } from "@react-native-firebase/firestore";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { getMessaging, requestPermission } from "@react-native-firebase/messaging";
import { useAuthStore } from "../../stores/authStore";
import {
	parseGdprZip,
	matchShowsAndMovies,
	searchTMDBPage,
	validateEpisodesAgainstCatalog,
	ParsedGdprData,
	ParsedShow,
	TMDBMatch,
	AmbiguousMatch,
} from "../../services/tvtimeImport";
import { getCachedCatalogShow } from "../../hooks/useWatchlist";
import LoadingSpinner from "../../components/LoadingSpinner";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WatchStatus, MediaType, CacheKey, CloudFunction } from "../../types";
import { spacing } from "../../theme";
import { importStyles as styles } from "./styles";
import PickPhase from "./PickPhase";
import ProgressPhase from "./ProgressPhase";
import DisambiguatePhase from "./DisambiguatePhase";
import ReviewPhase from "./ReviewPhase";

type Phase = "pick" | "matching" | "disambiguate" | "review" | "importing";

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

	// Disambiguation pagination
	const [disambigCandidates, setDisambigCandidates] = useState<TMDBMatch[]>([]);
	const disambigPageRef = useRef(1);
	const disambigTotalPagesRef = useRef(1);
	const [loadingMore, setLoadingMore] = useState(false);

	// Disambiguation history for back navigation
	const disambigHistory = useRef<({ type: "pick"; match: TMDBMatch } | { type: "skip" })[]>([]);

	// Restore import state on mount
	useEffect(() => {
		AsyncStorage.getItem(CacheKey.IMPORT_IN_PROGRESS).then((raw) => {
			if (!raw) return;
			try {
				const data = JSON.parse(raw);
				if (data.userId === user?.uid && !useAuthStore.getState().hasCompletedImport) {
					setPhase("importing");
				}
			} catch {}
		});
	}, [user?.uid]);

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

			// Request notification permission upfront (needed for import completion notification)
			try {
				await requestPermission(getMessaging());
			} catch {}

			setPhase("matching");
			setStatusText("Extracting data...");

			const asset = result.assets[0];
			const parsed = await parseGdprZip(asset.uri);
			parsedRef.current = parsed;

			if (user) {
				const db = getFirestore();
				const watchlistCol = collection(doc(db, "users", user.uid), "tracking");
				const snap = await getDocs(watchlistCol);
				const ids = new Set<number>();
				snap.docs.forEach((d) => ids.add(Number(d.id.replace(/^(tv|movie)_/, ""))));
				existingIdsRef.current = ids;
			}

			setStatusText("Importing from TV Time...");
			const matchResult = await matchShowsAndMovies(
				tmdbApiKey!,
				parsed.shows,
				parsed.movies,
				(done, total) => setProgress({ done, total }),
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
			nextPage,
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
		[buildSelection],
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
		[disambigIndex, ambiguous, finishDisambig],
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
	const handleImport = useCallback(() => {
		if (!user || !parsedRef.current) return;
		setPhase("importing");

		// Defer heavy work so React renders the importing screen first
		setTimeout(async () => {
			const parsed = parsedRef.current!;
			const selectedMatches = matched.filter((m) => selected.has(`${m.mediaType}-${m.tmdbId}`));

			const showByTvTimeId = new Map<number, ParsedShow>();
			for (const s of parsed.shows) {
				showByTvTimeId.set(s.tvTimeId, s);
			}

			function deriveStatus(show: ParsedShow): WatchStatus {
				if (show.isArchived) return WatchStatus.COMPLETED;
				if (show.isForLater) return WatchStatus.PLAN_TO_WATCH;
				return WatchStatus.WATCHING;
			}

			const cfMatches = selectedMatches.map((m) => {
				if (m.mediaType === MediaType.TV) {
					const show =
						m.tvTimeId !== undefined
							? showByTvTimeId.get(m.tvTimeId)
							: parsed.shows.find((s) => s.name === m.tvTimeName);

					const showEps =
						m.tvTimeId !== undefined
							? parsed.watchedEpisodes.filter((e) => e.tvTimeShowId === m.tvTimeId)
							: [];
					const rewatchEps =
						m.tvTimeId !== undefined
							? parsed.rewatchedEpisodes.filter((e) => e.tvTimeShowId === m.tvTimeId)
							: [];

					const rawEps = [...showEps, ...rewatchEps].map((e) => ({
						season: e.season,
						episode: e.episode,
						episodeName: e.episodeName,
						watchedAt: e.watchedAt,
					}));

					// Validate episodes against local catalog — remap orphans by name, drop unmatched
					const catalog = getCachedCatalogShow(m.tmdbId, MediaType.TV);
					const validatedEps = catalog?.seasons?.length
						? validateEpisodesAgainstCatalog(rawEps, catalog)
						: rawEps;

					return {
						tmdbId: m.tmdbId,
						mediaType: m.mediaType,
						status: show ? deriveStatus(show) : WatchStatus.WATCHING,
						watchedEpisodes: validatedEps.map((e) => ({
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
						status: WatchStatus.COMPLETED,
						movieWatchedAt: movie?.watchedAt || null,
						movieRuntime: movie ? Math.round(movie.runtimeSeconds / 60) : undefined,
					};
				}
			});

			await AsyncStorage.setItem(
				CacheKey.IMPORT_IN_PROGRESS,
				JSON.stringify({ userId: user!.uid, startedAt: Date.now() }),
			);

			const functions = getFunctions();
			const importFn = httpsCallable(functions, CloudFunction.IMPORT_MATCHES, {
				timeout: 3600000,
			});
			try {
				await importFn({ matches: cfMatches });
			} catch (err: any) {
				await AsyncStorage.removeItem(CacheKey.IMPORT_IN_PROGRESS);
				Alert.alert("Import Error", err.message || "Import failed.");
				setPhase("review");
				return;
			}
			// Mark import complete after CF succeeds
			await AsyncStorage.removeItem(CacheKey.IMPORT_IN_PROGRESS);
			useAuthStore.setState({ hasCompletedImport: true });
		}, 50);
	}, [user, matched, selected, navigation]);

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

	if (phase === "matching") {
		return <ProgressPhase insetTop={insetTop} statusText={statusText} progress={progress} />;
	}

	if (phase === "importing") {
		return (
			<View style={[styles.centered, { paddingTop: insetTop }]}>
				<Text style={styles.title}>Importing from TV Time</Text>
				<View style={{ marginTop: spacing.md }}>
					<LoadingSpinner />
				</View>
				<Text style={[styles.desc, { marginTop: spacing.xl }]}>
					This may take several minutes depending on how many shows you have. You can leave the app
					now.
				</Text>
				<Text style={[styles.desc, { marginTop: spacing.sm }]}>
					You'll be notified once the import is complete.
				</Text>
			</View>
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
				apiKey={tmdbApiKey!}
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
				onBack={() => {
					if (ambiguous.length > 0) {
						setDisambigIndex(ambiguous.length - 1);
						setPhase("disambiguate");
					} else {
						setPhase("pick");
					}
				}}
			/>
		);
	}

	return null;
}
