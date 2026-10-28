import { useState, useCallback, useRef, useEffect } from "react";
import { Alert } from "react-native";
import { getFirestore, collection, doc, getDocs, onSnapshot } from "@react-native-firebase/firestore";
import { getCrashlytics, recordError } from "@react-native-firebase/crashlytics";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "../../stores";
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
import { WatchStatus, MediaType, CacheKey, CloudFunction } from "../../types";
import {
	IMPORT_CLOCK_SKEW_MS,
	IMPORT_MAX_WAIT_MS,
	IMPORT_MAYBE_RUNNING_ERRORS,
} from "../../enums";

export type ImportPhase = "pick" | "matching" | "disambiguate" | "review" | "importing";

/**
 * TV Time import flow: parse the GDPR zip, match to TMDB, disambiguate,
 * review selection, then run the importMatches Cloud Function. Shared by the
 * mobile ImportDataScreen and the web import page (file picking is per-platform).
 * @param onComplete called once the import Cloud Function has finished
 */
export function useImportData(onComplete: () => void) {
	const user = useAuthStore((s) => s.user);
	const tmdbApiKey = useAuthStore((s) => s.appTmdbApiKey);

	const [phase, setPhase] = useState<ImportPhase>("pick");
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

	const importStartedAtRef = useRef(0);
	const importDoneRef = useRef(false);
	const onCompleteRef = useRef(onComplete);
	onCompleteRef.current = onComplete;

	const finishImport = useCallback(async () => {
		if (importDoneRef.current) return;
		importDoneRef.current = true;
		await AsyncStorage.removeItem(CacheKey.IMPORT_IN_PROGRESS);
		onCompleteRef.current();
	}, []);

	const failImport = useCallback(async (message: string) => {
		await AsyncStorage.removeItem(CacheKey.IMPORT_IN_PROGRESS);
		importStartedAtRef.current = 0;
		Alert.alert("Import Error", message);
		// After an app restart there's nothing to review → start over
		setPhase(parsedRef.current ? "review" : "pick");
	}, []);

	// Restore import state on mount
	useEffect(() => {
		AsyncStorage.getItem(CacheKey.IMPORT_IN_PROGRESS).then((raw) => {
			if (!raw) return;
			try {
				const data = JSON.parse(raw);
				if (data.userId === user?.uid && !useAuthStore.getState().hasCompletedImport) {
					importStartedAtRef.current = data.startedAt ?? 0;
					setPhase("importing");
				}
			} catch {}
		});
	}, [user?.uid]);

	// The server's lastImportAt stamp ends the wait: covers a call that gave up client-side
	// (timeout / dropped connection) while the CF kept going, and an app restart mid-import
	useEffect(() => {
		const startedAt = importStartedAtRef.current;
		if (phase !== "importing" || !user || !startedAt) return;
		const giveUp = setTimeout(
			() => failImport("The import didn't finish. Please try again."),
			Math.max(0, startedAt + IMPORT_MAX_WAIT_MS - Date.now()),
		);
		const unsubscribe = onSnapshot(
			doc(getFirestore(), "users", user.uid),
			(snap) => {
				const at = snap.data()?.lastImportAt?.toMillis?.() ?? 0;
				if (at >= startedAt - IMPORT_CLOCK_SKEW_MS) finishImport();
			},
			() => {},
		);
		return () => {
			clearTimeout(giveUp);
			unsubscribe();
		};
	}, [phase, user, finishImport, failImport]);

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

	// --- Phase 1: parse + match a TV Time GDPR zip (uri: file:// on mobile, blob: on web) ---
	const processFile = useCallback(
		async (uri: string) => {
			try {
				setPhase("matching");
				setStatusText("Extracting data...");

				const parsed = await parseGdprZip(uri);
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
		},
		[tmdbApiKey, user, buildSelection],
	);

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
		// First pick → back to the file picker (its Skip leaves the import)
		if (disambigIndex <= 0) {
			setPhase("pick");
			return;
		}
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
		importStartedAtRef.current = Date.now();
		importDoneRef.current = false;
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
				JSON.stringify({ userId: user!.uid, startedAt: importStartedAtRef.current }),
			);

			const functions = getFunctions();
			const importFn = httpsCallable(functions, CloudFunction.IMPORT_MATCHES, {
				timeout: 3600000,
			});
			try {
				await importFn({ matches: cfMatches });
			} catch (err: any) {
				recordError(
					getCrashlytics(),
					err instanceof Error ? err : new Error(String(err?.message ?? err)),
					"ImportError",
				);
				const code = String(err?.code ?? "").replace(/^functions\//, "");
				// Server may still finish → stay on "importing"; the lastImportAt listener ends it
				if (IMPORT_MAYBE_RUNNING_ERRORS.includes(code)) return;
				await failImport(err?.message || "Import failed.");
				return;
			}
			await finishImport();
		}, 50);
	}, [user, matched, selected, finishImport, failImport]);

	return {
		phase,
		setPhase,
		progress,
		statusText,
		parsedRef,
		matched,
		ambiguous,
		unmatchedNames,
		disambigIndex,
		setDisambigIndex,
		selected,
		existingIdsRef,
		disambigCandidates,
		loadingMore,
		tmdbApiKey,
		processFile,
		loadMoreCandidates,
		handleDisambiguate,
		handleSkipDisambig,
		handleBackDisambig,
		toggleSelected,
		handleImport,
	};
}
