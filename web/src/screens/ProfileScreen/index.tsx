import { Spin } from "antd";
import { IoPerson, IoSettingsSharp } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { useUserStats } from "@app/hooks/useUserStats";
import { useWatchlist } from "@app/hooks/useWatchlist";
import { useProfileCardImages } from "@app/hooks/useProfileCardImages";
import { useWatchingCount } from "@app/hooks/useWatchingCount";
import { useCompletedShows } from "@app/hooks/useCompletedShows";
import { useWeeklyActivity } from "@app/hooks/useWeeklyActivity";
import { formatCount, formatTime, scaledPhotoURL } from "@app/utils/format";
import { useAppSelector } from "../../store";
import PosterImage from "../../components/PosterImage";
import { Paths, showPath } from "../../routes/paths";
import { StatCard, CollageCard } from "./ProfileCards";
import WatchRate from "./WatchRate";
import historyStyles from "./WatchHistory/styles/WatchHistory.module.scss";
import CircleButton from "../../components/CircleButton";
import { CircleButtonTone } from "@app/enums";
import Marquee from "../../components/Marquee";
import styles from "./styles/ProfileScreen.module.scss";

/** Profile tab — stats, weekly chart, recently completed (same hooks as the app) */
export default function ProfileScreen() {
	const navigate = useNavigate();
	const user = useAppSelector((s) => s.auth.user);
	const { stats, loading: statsLoading } = useUserStats(user?.uid);
	const { items: watchlist } = useWatchlist(user?.uid);
	const cardImages = useProfileCardImages(watchlist);
	const { sections, loading: completedLoading } = useCompletedShows(user?.uid);
	const watchingCount = useWatchingCount(user?.uid);
	// Lifetime watched count, live from useUserStats' snapshot — the chart only queries the
	// watched collections when it moved by something this browser didn't mark
	const watchedTotal = statsLoading ? null : stats.episodesWatched + stats.moviesWatched;
	const { chartData, loading: chartLoading } = useWeeklyActivity(user?.uid, watchedTotal);

	return (
		<div className={styles.container}>
			<div className={styles.profileSection}>
				<div className={styles.statsGrid}>
					<div className={styles.statsRow}>
						<StatCard
							value={stats.episodesWatched}
							format={formatCount}
							label="Episodes"
							flex={3}
							backdrop={cardImages.episodeBackdrop}
							align="left"
							loading={statsLoading}
						/>
						<StatCard
							value={stats.moviesWatched}
							format={formatCount}
							label="Movies"
							flex={2}
							backdrop={cardImages.movieBackdrop}
							align="right"
							loading={statsLoading}
						/>
					</div>
					<div className={`${styles.statsRow} min-h-[150px]`}>
						<CollageCard
							value={watchingCount ?? 0}
							format={formatCount}
							label="Currently Watching"
							flex={2}
							posters={cardImages.trackingPosters}
							align="left"
							loading={statsLoading || watchingCount === null}
							seed={17}
						/>
						<CollageCard
							value={stats.totalMinutes}
							format={formatTime}
							label="Watch Time"
							flex={3}
							posters={cardImages.watchTimePosters}
							align="right"
							loading={statsLoading}
							seed={53}
						/>
					</div>
					<div className={styles.avatarOverlay}>
						<div className={`${styles.avatar} ${styles.avatarPlaceholder}`}>
							<IoPerson size={40} color="var(--text-muted)" />
						</div>
						{user?.photoURL && (
							<img
								src={scaledPhotoURL(user.photoURL, 100, window.devicePixelRatio || 1)}
								alt=""
								className={`${styles.avatar} absolute`}
								referrerPolicy="no-referrer"
							/>
						)}
					</div>
				</div>
				<div className={styles.header}>
					<span className={styles.name}>{user?.displayName || "User"}</span>
					<span className={styles.email}>{user?.email}</span>
				</div>
			</div>

			{/* Hall of Shame (Watch History) + Settings gear on one row */}
			<div className={styles.actionRow}>
				<button
					className={historyStyles.historyButton}
					onClick={() => navigate(Paths.WATCH_HISTORY)}
				>
					Hall of Shame
				</button>
				<CircleButton
					tone={CircleButtonTone.RAISED}
					className="size-14!"
					onClick={() => navigate(Paths.SETTINGS)}
					ariaLabel="Settings"
				>
					{/* ~55% of the 56px circle */}
					<IoSettingsSharp size={31} />
				</CircleButton>
			</div>

			<WatchRate data={chartData} loading={chartLoading} />

			{completedLoading ? (
				<div className={styles.completedLoader}>
					<Spin size="small" />
				</div>
			) : (
				sections.length > 0 && (
					<section className={styles.section}>
						<h3 className={styles.sectionTitle}>Recently Completed</h3>
						{sections.map((section, row) => (
							<div key={section.title} className={styles.genreSection}>
								<span className={styles.genreTitle}>{section.title}</span>
								{/* More than 6 → continuously scrolling loop; otherwise a plain row */}
								<Marquee
									items={section.items}
									// Stagger stacked rows: alternate direction, different start point
									// and slightly different speed so posters never line up in columns
									reverse={row % 2 === 1}
									offset={(row * 0.37) % 1}
									secondsPerItem={4 * (1 + ((row % 3) - 1) * 0.1)}
									getKey={(item) => `${item.mediaType}_${item.tmdbId}`}
									className={styles.posterRow}
									renderItem={(item, hidden) => (
										<button
											className={styles.posterButton}
											tabIndex={hidden ? -1 : undefined}
											onClick={() => navigate(showPath(item.mediaType, item.tmdbId))}
										>
											<PosterImage
												posterPath={item.posterPath}
												mediaType={item.mediaType}
												className={styles.completedPoster}
												title={!item.posterPath ? item.title : undefined}
												// Largest size it's shown at (desktop 140px) so it stays sharp
												width={140}
											/>
										</button>
									)}
								/>
							</div>
						))}
					</section>
				)
			)}
		</div>
	);
}
