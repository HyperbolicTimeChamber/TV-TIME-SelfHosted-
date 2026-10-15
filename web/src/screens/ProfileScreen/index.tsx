import { App as AntApp, Spin } from "antd";
import { IoPerson, IoSettingsSharp } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { useUserStats } from "@app/hooks/useUserStats";
import { useWatchlist } from "@app/hooks/useWatchlist";
import { useProfileCardImages } from "@app/hooks/useProfileCardImages";
import { useCompletedShows } from "@app/hooks/useCompletedShows";
import { formatCount, formatTime, scaledPhotoURL } from "@app/utils/format";
import { useAppSelector } from "../../store";
import { signOut } from "../../services/auth";
import PosterImage from "../../components/PosterImage";
import { Paths, showPath } from "../../routes/paths";
import { StatCard, CollageCard } from "./ProfileCards";
import historyStyles from "./WatchHistory/styles/WatchHistory.module.scss";
import CircleButton from "../../components/CircleButton";
import { CircleButtonTone } from "@app/enums";
import Marquee from "../../components/Marquee";
import styles from "./styles/ProfileScreen.module.scss";

/** Profile tab — stats, weekly chart, recently completed (same hooks as the app) */
export default function ProfileScreen() {
	const navigate = useNavigate();
	const { modal } = AntApp.useApp();
	const user = useAppSelector((s) => s.auth.user);
	const { stats, loading: statsLoading } = useUserStats(user?.uid);
	const { items: watchlist } = useWatchlist(user?.uid);
	const cardImages = useProfileCardImages(watchlist);
	const { sections, loading: completedLoading } = useCompletedShows(user?.uid);

	const confirmSignOut = () =>
		modal.confirm({
			title: "Log Out",
			content: "Are you sure?",
			okText: "Log Out",
			okButtonProps: { danger: true },
			onOk: async () => {
				await signOut();
				navigate(Paths.SEARCH, { replace: true });
			},
		});

	return (
		<div className={styles.container}>
			<div className={styles.profileSection}>
				<div className={styles.statsGrid}>
					<div className={styles.statsRow}>
						<StatCard value={formatCount(stats.episodesWatched)} label="Episodes" flex={3} backdrop={cardImages.episodeBackdrop} align="left" loading={statsLoading} />
						<StatCard value={formatCount(stats.moviesWatched)} label="Movies" flex={2} backdrop={cardImages.movieBackdrop} align="right" loading={statsLoading} />
					</div>
					<div className={`${styles.statsRow} min-h-[150px]`}>
						<CollageCard value={formatCount(stats.showsTracking)} label="Tracking" flex={2} posters={cardImages.trackingPosters} align="left" loading={statsLoading} seed={17} />
						<CollageCard value={formatTime(stats.totalMinutes)} label="Watch Time" flex={3} posters={cardImages.watchTimePosters} align="right" loading={statsLoading} seed={53} />
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

			{/* Hall of Shame (Watch History) + Settings gear on one row.
			    No Watch Statistics chart on web: its data is a per-device local cache */}
			<div className={styles.actionRow}>
				<button className={historyStyles.historyButton} onClick={() => navigate(Paths.WATCH_HISTORY)}>
					Hall of Shame
					<span className={historyStyles.historyButtonSub}>Where did all the time go</span>
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

			<button className={styles.signOutButton} onClick={confirmSignOut}>
				Log Out
			</button>
		</div>
	);
}
