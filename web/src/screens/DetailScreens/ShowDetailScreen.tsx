import { useEffect, useState } from "react";
import { App as AntApp } from "antd";
import { IoChevronBack, IoShareSocialOutline } from "react-icons/io5";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useShowDetailActions } from "@app/screens/DetailScreens/useShowDetailActions";
import { tmdbBackdropUri, tmdbPosterUri } from "@app/hooks/useTmdbImage";
import { MediaType } from "@app/enums";
import { showShareUrl } from "@app/utils/shareUrl";
import LoadingScreen from "../../components/LoadingScreen";
import ConfirmModal from "../../components/ConfirmModal";
import UnreleasedMovieModal from "../../components/UnreleasedMovieModal";
import WatchActionSheet from "../../components/WatchActionSheet";
import SeasonDropdown from "../../components/SeasonDropdown";
import ActionPills from "./ActionPills";
import { Paths } from "../../routes/paths";
import { appDeepLink, isMobileBrowser } from "../../utils/deepLink";
import styles from "./ShowDetailScreen.module.css";

/** Show / movie page — public (read-only for guests) and the target of share links */
export default function ShowDetailScreen() {
	const params = useParams();
	const tmdbId = Number(params.tmdbId);
	const mediaType = params.mediaType === "movie" ? MediaType.MOVIE : MediaType.TV;
	const navigate = useNavigate();
	const location = useLocation();
	const { message } = AntApp.useApp();
	const d = useShowDetailActions(tmdbId, mediaType);
	const signedIn = !!d.user;

	// Opened directly (share link / new tab): no in-app history, so go to the watchlist
	// (or search for guests) instead of leaving the site
	const handleBack = () => {
		if (location.key !== "default") navigate(-1);
		else navigate(signedIn ? Paths.HOME : Paths.SEARCH, { replace: true });
	};

	// Parallax backdrop (app: translateY = min(y * 0.4, 175))
	const [parallax, setParallax] = useState(0);
	useEffect(() => {
		const onScroll = () => setParallax(Math.min(window.scrollY * 0.4, 175));
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	useEffect(() => {
		if (d.title) document.title = `${d.title} · Watchloom`;
		return () => {
			document.title = "Watchloom";
		};
	}, [d.title]);

	if (d.isLoading || d.trackingLoading) return <LoadingScreen />;
	if (d.isError || !d.show) {
		return (
			<p className={styles.errorText}>
				{d.isError ? (d.error as Error)?.message || "Failed to load show" : "Show not found"}
			</p>
		);
	}
	const show = d.show;

	const share = async () => {
		const url = showShareUrl(mediaType, tmdbId);
		try {
			if (navigator.share) await navigator.share({ title: d.title, text: `Check out ${d.title}`, url });
			else {
				await navigator.clipboard.writeText(url);
				message.success("Link copied");
			}
		} catch {
			/* share sheet dismissed */
		}
	};

	const backdropSrc = show.backdrop_path
		? tmdbBackdropUri(show.backdrop_path, 1280)
		: show.poster_path
			? tmdbPosterUri(show.poster_path, 780)
			: null;

	return (
		<div className={styles.container}>
			<button className={`${styles.floatButton} ${styles.backButton}`} onClick={handleBack} aria-label="Back">
				<IoChevronBack size={26} />
			</button>
			<button className={`${styles.floatButton} ${styles.shareButton}`} onClick={share} aria-label="Share">
				<IoShareSocialOutline size={24} />
			</button>

			<div className={styles.backdrop}>
				{backdropSrc && (
					<img src={backdropSrc} alt="" className={styles.backdropImg} style={{ transform: `translateY(${parallax}px)` }} />
				)}
			</div>
			<div className={styles.gradientIsland}>
				<div className={styles.island}>
					<h1 className={styles.islandTitle}>{d.title}</h1>
					{signedIn ? (
						<ActionPills
							mediaType={mediaType}
							watchlistItem={d.watchlistItem}
							adding={d.adding}
							removing={d.removing}
							movieWatchCount={d.movieWatchCount}
							hasWatchedEpisodes={d.showWatchedEps.length > 0}
							onAddToWatchlist={d.handleAddToWatchlist}
							onMarkMovieWatched={d.handleMarkMovieWatched}
							onResumeOrRewatch={d.handleResumeOrRewatch}
							onRemove={d.handleRemove}
							onMovieSheetOpen={() => d.setMovieSheetVisible(true)}
						/>
					) : (
						<div className={styles.pillRow}>
							<button
								className={`${styles.pill} ${styles.pillPrimary}`}
								onClick={() => navigate(`${Paths.LOGIN}?next=${encodeURIComponent(location.pathname)}`)}
							>
								Sign in to track
							</button>
							{isMobileBrowser() && (
								<a className={`${styles.pill} ${styles.pillAccent}`} href={appDeepLink(mediaType, tmdbId)}>
									Open in app
								</a>
							)}
						</div>
					)}
				</div>
			</div>

			<div className={styles.content}>
				<div className={styles.statsBar}>
					{mediaType === MediaType.MOVIE && show.runtime ? (
						<Stat value={`${Math.floor(show.runtime / 60)}h ${show.runtime % 60}m`} label="RUNTIME" />
					) : null}
					<Stat value={d.year || "—"} label={mediaType === MediaType.MOVIE ? "RELEASED" : "YEAR"} />
					{mediaType === MediaType.TV && show.number_of_seasons ? (
						<Stat value={show.number_of_seasons} label={show.number_of_seasons > 1 ? "SEASONS" : "SEASON"} />
					) : null}
					{mediaType === MediaType.TV && show.number_of_episodes ? (
						<Stat value={show.number_of_episodes} label="EPISODES" />
					) : null}
					{show.vote_average ? <Stat value={show.vote_average.toFixed(1)} label="RATING" /> : null}
				</div>
				<p className={styles.overview}>{show.overview}</p>

				{mediaType === MediaType.MOVIE && (
					<div className={styles.creditsSection}>
						{(
							[
								["Director", d.directors],
								["Screenplay", d.writers],
								["Production", d.producers],
							] as const
						).map(([label, names]) =>
							names.length > 0 ? (
								<div key={label} className={styles.creditBlock}>
									<span className={styles.creditLabel}>{label}</span>
									<span className={styles.creditNames}>{names.join(", ")}</span>
								</div>
							) : null,
						)}
					</div>
				)}

				{mediaType === MediaType.TV && show.seasons && (
					<section className={styles.seasonsSection}>
						<h2 className={styles.sectionTitle}>Seasons</h2>
						{show.seasons
							.filter((s) => s.season_number > 0)
							.map((season) => (
								<SeasonDropdown
									key={season.season_number}
									tmdbId={tmdbId}
									season={season}
									showTitle={d.title}
									showPosterPath={show.poster_path}
									showBackdropPath={show.backdrop_path || null}
									isTracked={!!d.watchlistItem}
									trackingItem={d.watchlistItem}
									seasonLayout={d.seasonLayout}
									episodesBySeason={d.episodesBySeason}
									preloadedEpisodes={d.episodesBySeason.get(season.season_number)}
									readOnly={!signedIn}
								/>
							))}
					</section>
				)}
			</div>

			{signedIn && (
				<>
					<ConfirmModal
						visible={d.removeModalVisible}
						title={`Remove "${d.title}"?`}
						hint="This will remove it from your watchlist. Your watch history will be kept."
						error={d.removeError}
						confirmLabel="Remove"
						loading={d.removing}
						onConfirm={d.handleConfirmRemove}
						onClose={() => {
							d.setRemoveModalVisible(false);
							d.setRemoveError(null);
						}}
					/>
					<UnreleasedMovieModal
						visible={!!d.unreleasedModal}
						onClose={() => d.setUnreleasedModal(null)}
						movieTitle={d.unreleasedModal?.title ?? ""}
					/>
					<WatchActionSheet
						visible={d.movieSheetVisible}
						label={show.title || show.name || "Movie"}
						watchCount={d.movieWatchCount}
						onSelect={d.handleMovieSheetAction}
						onClose={() => d.setMovieSheetVisible(false)}
					/>
				</>
			)}
		</div>
	);
}

function Stat({ value, label }: { value: string | number; label: string }) {
	return (
		<>
			<div className={styles.statItem}>
				<span className={styles.statValue}>{value}</span>
				<span className={styles.statLabel}>{label}</span>
			</div>
			<span className={styles.statDivider} />
		</>
	);
}
