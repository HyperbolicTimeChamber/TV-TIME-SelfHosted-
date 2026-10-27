import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Progress } from "antd";
import { animate } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useImportData } from "@app/screens/ImportDataScreen/useImportData";
import { getShowDetails } from "@app/services/tmdb";
import { tmdbPosterUri } from "@app/hooks/useTmdbImage";
import type { MediaType } from "@app/enums";
import type { ShowDrawerData } from "@app/types";
import type { TMDBMatch } from "@app/services/tvtimeImport";
import { useAppDispatch } from "../../store";
import { importCompleted } from "../../store/authSlice";
import AnimatedModal from "../../components/AnimatedModal";
import LoadingSpinner from "../../components/LoadingSpinner";
import ShowDrawer from "../../components/ShowDrawer";
import ui from "../../components/styles/ui.module.scss";
import { useLongPress } from "../../hooks/useLongPress";
import styles from "./styles/ImportDataScreen.module.scss";

function Counter({ target, total }: { target: number; total: number }) {
	const [display, setDisplay] = useState(0);
	const from = useRef(0);
	useEffect(() => {
		const controls = animate(from.current, target, {
			duration: Math.min(0.9, Math.max(0.3, (target - from.current) * 0.02)),
			ease: [0.33, 1, 0.68, 1],
			onUpdate: (v) => setDisplay(Math.round(v)),
		});
		from.current = target;
		return () => controls.stop();
	}, [target]);
	return (
		<>
			<Progress
				percent={total ? (display / total) * 100 : 0}
				showInfo={false}
				strokeColor="var(--primary)"
				className="w-4/5! mt-4"
			/>
			<span className={styles.progressText}>
				{display} / {total}
			</span>
		</>
	);
}

function CandidateRow({
	item,
	apiKey,
	onSelect,
}: {
	item: TMDBMatch;
	apiKey: string;
	onSelect: () => void;
}) {
	const [drawer, setDrawer] = useState<{
		visible: boolean;
		data: ShowDrawerData | null;
		loading: boolean;
	}>({ visible: false, data: null, loading: false });
	const openDetails = async () => {
		setDrawer((d) => ({ ...d, visible: true, loading: !d.data }));
		if (drawer.data) return;
		const base: ShowDrawerData = {
			title: item.tmdbName,
			posterPath: item.posterPath,
			backdropPath: null,
			overview: item.overview || null,
			mediaType: item.mediaType as MediaType,
			year: item.year || null,
			totalSeasons: item.totalSeasons,
			totalEpisodes: item.totalEpisodes,
		};
		try {
			const d = (await getShowDetails(apiKey, item.tmdbId, item.mediaType)) as any;
			setDrawer({
				visible: true,
				loading: false,
				data: {
					...base,
					backdropPath: d?.backdrop_path ?? null,
					overview: d?.overview || base.overview,
					totalSeasons: d?.number_of_seasons ?? base.totalSeasons,
					totalEpisodes: d?.number_of_episodes ?? base.totalEpisodes,
					runtime: d?.runtime ?? d?.episode_run_time?.[0] ?? null,
					status: d?.status ?? null,
					genres: d?.genres?.map((g: { name: string }) => g.name).join(", ") || null,
				},
			});
		} catch {
			setDrawer({ visible: true, loading: false, data: base });
		}
	};
	const press = useLongPress(openDetails, onSelect);
	return (
		<>
			<div className={styles.candidateRow} role="button" {...press}>
				{item.posterPath ? (
					<img src={tmdbPosterUri(item.posterPath, 60)} alt="" className={styles.poster} />
				) : (
					<div className={`${styles.poster} ${styles.noPoster}`}>?</div>
				)}
				<div className={styles.candidateInfo}>
					<div className={styles.candidateHeader}>
						<span className={styles.candidateName}>{item.tmdbName}</span>
						<span
							className={`${styles.typeBadge} ${item.mediaType === "movie" ? styles.typeBadgeMovie : ""}`}
						>
							{item.mediaType === "tv" ? "TV" : "MOVIE"}
						</span>
					</div>
					<span className={styles.candidateYear}>{item.year || "N/A"}</span>
					<span className={styles.candidateOverview}>
						{item.overview || "No description available"}
					</span>
					<span className={styles.expandHint}>Long press for details</span>
				</div>
			</div>
			<ShowDrawer
				visible={drawer.visible}
				show={drawer.data}
				loading={drawer.loading}
				onClose={() => setDrawer((d) => ({ ...d, visible: false }))}
			/>
		</>
	);
}

/** TV Time import (app ImportDataScreen) — same flow via useImportData */
export default function ImportDataScreen() {
	const navigate = useNavigate();
	const dispatch = useAppDispatch();
	const fileInput = useRef<HTMLInputElement>(null);
	const imp = useImportData(() => dispatch(importCompleted()));
	const [showInfo, setShowInfo] = useState(true);

	const review = useMemo(() => {
		const seen = new Set<string>();
		const shows: TMDBMatch[] = [];
		const movies: TMDBMatch[] = [];
		for (const m of imp.matched) {
			const key = `${m.mediaType}-${m.tmdbId}`;
			if (seen.has(key)) continue;
			seen.add(key);
			(m.mediaType === "tv" ? shows : movies).push(m);
		}
		const selShows = imp.matched.filter(
			(m) => m.mediaType === "tv" && imp.selected.has(`tv-${m.tmdbId}`),
		);
		const selectedTvTimeIds = new Set(
			selShows.map((m) => m.tvTimeId).filter((x) => x !== undefined),
		);
		const episodes =
			imp.parsedRef.current?.watchedEpisodes.filter((e) => selectedTvTimeIds.has(e.tvTimeShowId))
				.length ?? 0;
		const movieCount = imp.matched.filter(
			(m) => m.mediaType === "movie" && imp.selected.has(`movie-${m.tmdbId}`),
		).length;
		return { shows, movies, showCount: selShows.length, movieCount, episodes };
	}, [imp.matched, imp.selected, imp.parsedRef]);

	if (imp.phase === "pick") {
		return (
			<div className={styles.centered}>
				<h1 className={styles.title}>Import TV Time Data</h1>
				<p className={styles.desc}>
					Select your TV Time GDPR export (.zip) to import your watch history.
				</p>
				<input
					ref={fileInput}
					type="file"
					accept=".zip,application/zip"
					hidden
					onChange={(e) => {
						const file = e.target.files?.[0];
						if (file) imp.processFile(URL.createObjectURL(file));
						e.target.value = "";
					}}
				/>
				<button className={styles.primaryButton} onClick={() => fileInput.current?.click()}>
					Select ZIP File
				</button>
				<button className={styles.skipButton} onClick={() => navigate(-1)}>
					Skip
				</button>
			</div>
		);
	}

	if (imp.phase === "matching") {
		return (
			<div className={styles.centered}>
				<h1 className={styles.title}>{imp.statusText}</h1>
				<div className="mt-3">
					<LoadingSpinner />
				</div>
				{imp.progress.total > 0 && (
					<Counter target={imp.progress.done} total={imp.progress.total} />
				)}
				<p className={styles.warning}>Do not close this tab during import</p>
			</div>
		);
	}

	if (imp.phase === "importing") {
		return (
			<div className={styles.centered}>
				<h1 className={styles.title}>Importing from TV Time</h1>
				<div className="mt-3">
					<LoadingSpinner />
				</div>
				<p className={`${styles.desc} mt-6!`}>
					This may take several minutes depending on how many shows you have. You can leave this
					page now.
				</p>
				<p className={styles.desc}>Your watchlist fills in as the import finishes.</p>
			</div>
		);
	}

	if (imp.phase === "disambiguate") {
		const current = imp.ambiguous[imp.disambigIndex];
		return (
			<div className={styles.container}>
				<AnimatedModal
					visible={showInfo && imp.disambigIndex === 0}
					onClose={() => setShowInfo(false)}
				>
					<p className={ui.modalTitle}>Duplicate Results</p>
					<p className={ui.modalHint}>
						Some shows or movies from your TV Time export matched multiple results on TMDB. This can
						happen when names are shared across different shows, movies, remakes, or regional
						versions.
					</p>
					<p className={ui.modalHint}>
						Pick the correct match for each one so your watch history imports accurately. You can
						also skip any you don't want to import.
					</p>
					<button className={ui.button} onClick={() => setShowInfo(false)}>
						Resolve
					</button>
				</AnimatedModal>
				<div className={styles.disambigHeader}>
					<h2 className={styles.sectionTitle}>
						Resolve {imp.disambigIndex + 1}/{imp.ambiguous.length}: "{current.tvTimeName}"
					</h2>
					<button
						className={styles.infoButton}
						onClick={() => setShowInfo(true)}
						aria-label="What is this?"
					>
						?
					</button>
				</div>
				<p className={styles.expectedRow}>
					Type:{" "}
					<span
						className={`${styles.typeBadge} ${current.mediaType === "movie" ? styles.typeBadgeMovie : ""}`}
					>
						{current.mediaType === "tv" ? "TV" : "MOVIE"}
					</span>{" "}
					· Tap to select, long press for details
				</p>
				<div className={styles.list}>
					{imp.disambigCandidates.map((c) => (
						<CandidateRow
							key={c.tmdbId}
							item={c}
							apiKey={imp.tmdbApiKey!}
							onSelect={() => imp.handleDisambiguate(c)}
						/>
					))}
					<div className={styles.loadMore}>
						<Button onClick={imp.loadMoreCandidates} loading={imp.loadingMore}>
							More results
						</Button>
					</div>
				</div>
				<div className={styles.footer}>
					{imp.disambigIndex > 0 ? (
						<button className={styles.footerBack} onClick={imp.handleBackDisambig}>
							&lt; Back
						</button>
					) : (
						<span />
					)}
					<button className={styles.footerSkip} onClick={imp.handleSkipDisambig}>
						Skip &gt;
					</button>
				</div>
			</div>
		);
	}

	if (imp.phase === "review" && imp.parsedRef.current) {
		const row = (m: TMDBMatch) => {
			const key = `${m.mediaType}-${m.tmdbId}`;
			const checked = imp.selected.has(key);
			const duplicate = imp.existingIdsRef.current.has(m.tmdbId);
			return (
				<button
					key={key}
					className={`${styles.reviewRow} ${duplicate ? styles.reviewRowDuplicate : ""}`}
					onClick={() => imp.toggleSelected(key)}
				>
					<span className={`${styles.checkbox} ${checked ? styles.checkboxChecked : ""}`}>
						{checked && "✓"}
					</span>
					{m.posterPath ? (
						<img src={tmdbPosterUri(m.posterPath, 40)} alt="" className={styles.posterSmall} />
					) : (
						<span className={`${styles.posterSmall} ${styles.noPoster}`}>?</span>
					)}
					<span className={styles.reviewInfo}>
						<span className={styles.reviewName}>{m.tmdbName}</span>
						<span className={styles.reviewSub}>
							{m.tvTimeName !== m.tmdbName ? `"${m.tvTimeName}" → ${m.year}` : m.year}
						</span>
						{duplicate && <span className={styles.duplicateBadge}>Already in watchlist</span>}
					</span>
				</button>
			);
		};
		return (
			<div className={styles.container}>
				<h2 className={styles.sectionTitle}>Review Import ({imp.selected.size} selected)</h2>
				<div className={styles.list}>
					{review.shows.length > 0 && <h3 className={styles.subhead}>Shows</h3>}
					{review.shows.map(row)}
					{review.movies.length > 0 && <h3 className={styles.subhead}>Movies</h3>}
					{review.movies.map(row)}
					{imp.unmatchedNames.length > 0 && (
						<h3 className={styles.subhead}>Unmatched ({imp.unmatchedNames.length})</h3>
					)}
					{imp.unmatchedNames.map((n, i) => (
						<p key={`${n}-${i}`} className={styles.unmatchedText}>
							{n}
						</p>
					))}
				</div>
				<div className={styles.footer}>
					<button
						className={styles.footerBack}
						onClick={() => {
							if (imp.ambiguous.length > 0) {
								imp.setDisambigIndex(imp.ambiguous.length - 1);
								imp.setPhase("disambiguate");
							} else imp.setPhase("pick");
						}}
					>
						← Back
					</button>
					<button
						className={`${styles.primaryButton} m-0! flex-1`}
						onClick={imp.handleImport}
						disabled={imp.selected.size === 0}
					>
						Import {review.showCount} shows, {review.movieCount} movies, {review.episodes} episodes
					</button>
				</div>
			</div>
		);
	}

	return null;
}
