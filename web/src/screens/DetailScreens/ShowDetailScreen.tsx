import { useEffect, useState } from "react";
import { App as AntApp } from "antd";
import { IoShareSocialOutline } from "react-icons/io5";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useShowDetailActions } from "@app/screens/DetailScreens/useShowDetailActions";
import { tmdbBackdropUri, tmdbPosterUri } from "@app/hooks/useTmdbImage";
import { CircleButtonTone, MediaType, WatchStatus } from "@app/enums";
import { showShareUrl } from "@app/utils/shareUrl";
import LoadingScreen from "../../components/LoadingScreen";
import CircleButton, { CircleBackButton } from "../../components/CircleButton";
import ErrorState from "../../components/ErrorState";
import { describeLoadError } from "@app/utils/loadError";
import ConfirmModal from "../../components/ConfirmModal";
import { colors } from "../../theme/index";
import { ModalBackdrop, ModalLogo } from "../../components/ModalArt";
import { getCachedCatalogShow } from "@app/hooks/useWatchlist";
import { pickTitleLogo } from "@app/services/tmdb";
import UnreleasedMovieModal from "../../components/UnreleasedMovieModal";
import WatchActionSheet from "../../components/WatchActionSheet";
import SeasonDropdown from "../../components/SeasonDropdown";
import ActionPills from "./ActionPills";
import { Paths } from "../../routes/paths";
import { appDeepLink, isAndroidBrowser } from "../../utils/deepLink";
import styles from "./styles/ShowDetailScreen.module.scss";
import { cssVars, px } from "../../utils/cssVars";

/** Show / movie page — public (read-only for guests) and the target of share links */
export default function ShowDetailScreen() {
	const params = useParams();
	const tmdbId = Number(params.tmdbId);
	const mediaType = params.mediaType === "movie" ? MediaType.MOVIE : MediaType.TV;
	const navigate = useNavigate();
	const location = useLocation();
	const { message } = AntApp.useApp();
	const d = useShowDetailActions(tmdbId, mediaType);
	// Catalog's logo, else the one that came with the details (same request as the page data)
	const logoPath =
		getCachedCatalogShow(tmdbId, mediaType)?.logoPath ??
		(d.show?.images ? pickTitleLogo(d.show.images.logos) : undefined);
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
		const info = describeLoadError(d.isError ? d.error : null, mediaType);
		return (
			<>
				<CircleBackButton
					tone={CircleButtonTone.OVERLAY}
					className={`${styles.floatButton} ${styles.backButton}`}
					onClick={handleBack}
				/>
				<ErrorState
					info={info}
					mediaType={mediaType}
					primary={
						info.canRetry
							? { label: "Try Again", onPress: () => d.refetch() }
							: { label: "Search Shows & Movies", onPress: () => navigate(Paths.SEARCH) }
					}
					secondary={
						signedIn ? { label: "Go to Watchlist", onPress: () => navigate(Paths.HOME) } : undefined
					}
				/>
			</>
		);
	}
	const show = d.show;

	const share = async () => {
		const url = showShareUrl(mediaType, tmdbId);
		try {
			if (navigator.share)
				await navigator.share({ title: d.title, text: `Check out ${d.title}`, url });
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
			<CircleBackButton
				tone={CircleButtonTone.OVERLAY}
				className={`${styles.floatButton} ${styles.backButton}`}
				onClick={handleBack}
			/>
			<CircleButton
				tone={CircleButtonTone.OVERLAY}
				className={`${styles.floatButton} ${styles.shareButton}`}
				onClick={share}
				ariaLabel="Share"
			>
				<IoShareSocialOutline size={24} />
			</CircleButton>

			<div className={styles.backdrop}>
				{backdropSrc && (
					<img
						src={backdropSrc}
						alt=""
						className={`${styles.backdropImg} translate-y-(--parallax)`}
						style={cssVars({ "--parallax": px(parallax) })}
					/>
				)}
			</div>
			<div className={styles.gradientIsland}>
				<div className={styles.island}>
					{/* Title logo (name as the fallback), centred */}
					<h1 className={styles.islandLogo} aria-label={d.title}>
						<ModalLogo
							logoPath={logoPath}
							tmdbId={tmdbId}
							mediaType={mediaType}
							title={d.title}
							nameDelay={2000}
						/>
					</h1>
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
							onPause={() => d.setPauseModalVisible(true)}
							onRemove={d.handleRemove}
							onMovieSheetOpen={() => d.setMovieSheetVisible(true)}
						/>
					) : (
						<div className={styles.pillRow}>
							<button
								className={`${styles.pill} ${styles.pillPrimary}`}
								onClick={() =>
									navigate(`${Paths.LOGIN}?next=${encodeURIComponent(location.pathname)}`)
								}
							>
								Sign in to track
							</button>
							{isAndroidBrowser() && (
								<a
									className={`${styles.pill} ${styles.pillAccent}`}
									href={appDeepLink(mediaType, tmdbId)}
								>
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
						<Stat
							value={`${Math.floor(show.runtime / 60)}h ${show.runtime % 60}m`}
							label="RUNTIME"
						/>
					) : null}
					<Stat value={d.year || "—"} label={mediaType === MediaType.MOVIE ? "RELEASED" : "YEAR"} />
					{mediaType === MediaType.TV && show.number_of_seasons ? (
						<Stat
							value={show.number_of_seasons}
							label={show.number_of_seasons > 1 ? "SEASONS" : "SEASON"}
						/>
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
						title={mediaType === MediaType.MOVIE ? "Remove Movie?" : "Remove Show?"}
						image={
							<ModalLogo
								logoPath={logoPath}
								tmdbId={tmdbId}
								mediaType={mediaType}
								title={d.title}
							/>
						}
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
					<ConfirmModal
						visible={d.pauseModalVisible}
						title={
							d.watchlistItem?.status === WatchStatus.REWATCHING ? "Pause Rewatch?" : "Pause Show?"
						}
						imageAtTop={!!show.backdrop_path}
						hideTitle
						image={
							show.backdrop_path ? (
								<ModalBackdrop
									backdropPath={show.backdrop_path}
									logoPath={logoPath}
									tmdbId={tmdbId}
									mediaType={mediaType}
									title={d.title}
									paused
									nameDelay={2000}
								/>
							) : (
								<ModalLogo
									logoPath={logoPath}
									tmdbId={tmdbId}
									mediaType={mediaType}
									title={d.title}
									paused
									nameDelay={2000}
								/>
							)
						}
						hint={
							d.watchlistItem?.status === WatchStatus.REWATCHING
								? "Pausing this rewatch will take it off your watchlist. You can resume it any time from here."
								: "Pausing this show will take it off your watchlist. You can resume it any time from here."
						}
						confirmLabel="Pause"
						confirmColor={colors.stopBlue}
						loading={d.pausing}
						onConfirm={d.handleConfirmPause}
						onClose={() => d.setPauseModalVisible(false)}
					/>
					{/* A failed add reports here, as it does in the app (app AddFailedModal) */}
					<ConfirmModal
						visible={!!d.addFailure}
						title="Couldn't add that one"
						image={
							d.addFailure?.backdropPath ? (
								<ModalBackdrop
									backdropPath={d.addFailure.backdropPath}
									logoPath={d.addFailure.logoPath}
									tmdbId={d.addFailure.tmdbId}
									mediaType={d.addFailure.mediaType}
									title={d.addFailure.title}
								/>
							) : undefined
						}
						hint={
							d.addFailure ? `${d.addFailure.title} is still not on your watch list.` : undefined
						}
						error={d.addFailure?.message ?? null}
						confirmLabel="Retry"
						loading={d.adding}
						onConfirm={d.handleAddToWatchlist}
						onClose={() => d.setAddFailure(null)}
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
