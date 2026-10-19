import { useCallback, useEffect, useRef } from "react";
import { Button } from "antd";
import { useNavigate } from "react-router-dom";
import { useUpcomingScreen, type ListItem } from "@app/screens/HomeScreen/UpcomingTab/useUpcomingScreen";
import { MediaType } from "@app/enums";
import type { UpcomingEpisode } from "@app/types";
import { todayStr } from "@app/utils/todayStr";
import { formatAirTime } from "@app/utils/airTime";
import PosterImage from "../../components/PosterImage";
import EpisodeDetailModal from "../../components/EpisodeDetailModal";
import ShowDrawer from "../../components/ShowDrawer";
import LoadingScreen from "../../components/LoadingScreen";
import HomeEmpty, { UPCOMING_EMPTY_ART } from "./HomeEmpty";
import { showPath } from "../../routes/paths";
import card from "../../components/styles/ShowCard.module.scss";
import styles from "./styles/HomeScreen.module.scss";

function formatDate(dateStr: string) {
	const date = new Date(`${dateStr}T00:00:00`);
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	const day = 86400000;
	const diff = Math.round((date.getTime() - now.getTime()) / day);
	if (diff === 0) return "Today";
	if (diff === 1) return "Tomorrow";
	if (diff === -1) return "Yesterday";
	return date.toLocaleDateString("en-US", {
		weekday: "long",
		month: "short",
		day: "numeric",
		...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
	});
}

const pad = (n: number) => String(n).padStart(2, "0");

function UpcomingRow({
	episode,
	onPress,
	onTitlePress,
}: {
	episode: UpcomingEpisode;
	onPress: (ep: UpcomingEpisode) => void;
	onTitlePress: (ep: UpcomingEpisode) => void;
}) {
	const isMovie = episode.mediaType === MediaType.MOVIE;
	// Local air time (TVMaze) — only when the exact time is known
	const airTime = isMovie ? null : formatAirTime(episode.airStamp);
	return (
		<div className={`${card.container} ${styles.upcomingRow}`} onClick={() => onPress(episode)} role="button">
			<PosterImage posterPath={episode.posterPath} mediaType={episode.mediaType} className={card.poster} />
			<div className={card.info}>
				<button
					className={card.titlePill}
					onClick={(e) => {
						e.stopPropagation();
						onTitlePress(episode);
					}}
				>
					<span className={card.titleText}>{episode.showTitle.toUpperCase()}</span>
					<span className={card.titleArrow}>›</span>
				</button>
				{isMovie ? (
					<span className={`${card.movieBadge} rounded-sm!`}>
						MOVIE
					</span>
				) : (
					<>
						<span className={card.episode}>
							S{pad(episode.season)} | E{pad(episode.episode)}
						</span>
						{episode.episodeTitle && <span className={card.episodeName}>{episode.episodeTitle}</span>}
					</>
				)}
			</div>
			{airTime && <span className={styles.upcomingTime}>{airTime}</span>}
		</div>
	);
}

/** Upcoming tab: last 20 aired days (local queue) above today + future, same as the app */
export default function UpcomingTab() {
	const navigate = useNavigate();
	const goToShow = useCallback((tmdbShowId: number) => navigate(showPath(MediaType.TV, tmdbShowId)), [navigate]);
	const u = useUpcomingScreen(goToShow);
	const todayRef = useRef<HTMLDivElement>(null);
	const scrolled = useRef(false);
	const today = todayStr();

	// Open scrolled to today (past days sit above)
	useEffect(() => {
		if (scrolled.current || u.isLoading || !u.listData.length) return;
		scrolled.current = true;
		requestAnimationFrame(() => todayRef.current?.scrollIntoView({ block: "start" }));
	}, [u.isLoading, u.listData.length]);

	if (u.isLoading) return <LoadingScreen label="Predicting Your Future..." hint="This may take a moment" />;
	if (u.error) {
		return (
			<div className={styles.center}>
				<p className={styles.error}>{u.error}</p>
				<Button type="primary" onClick={u.retry}>
					Retry
				</Button>
			</div>
		);
	}
	// Nothing from today on: the empty state — alone, or under the already-aired days still unwatched
	const nothingUpcoming = !u.listData.some((i: ListItem) => i.type === "header" && i.date >= today);
	const emptyState = (
		<HomeEmpty
			art={UPCOMING_EMPTY_ART}
			framed
			title="Nothing Upcoming to Watch?"
			subtitle="Aw. Who saw that coming?"
			tagline="Your schedule's as empty as a cancelled show's future. Add something now. Trust us."
		/>
	);
	if (u.listData.length === 0) return emptyState;

	const firstUpcomingDate = u.listData.find((i: ListItem) => i.type === "header" && i.date >= today) as
		| { date: string }
		| undefined;
	return (
		<>
			<div className={styles.list}>
				{u.listData.map((item: ListItem) => {
					if (item.type === "header") {
						const isFirstUpcoming = item.date === firstUpcomingDate?.date;
						return (
							<div
								key={`header_${item.date}`}
								className={styles.sectionHeader}
								ref={isFirstUpcoming ? todayRef : undefined}
							>
								<span className={`${styles.sectionPill} ${item.date < today ? styles.sectionPillPast : ""}`}>
									{formatDate(item.date)}
								</span>
							</div>
						);
					}
					const ep = item.episode;
					return (
						<UpcomingRow
							key={`ep_${ep.tmdbShowId}_S${ep.season}E${ep.episode}`}
							episode={ep}
							onPress={u.handleEpisodePress}
							onTitlePress={u.handleTitlePress}
						/>
					);
				})}
			</div>
			{nothingUpcoming ? emptyState : <div className="min-h-[60dvh]" />}

			{u.epModalData && (
				<EpisodeDetailModal
					visible={u.epModalVisible}
					tmdbId={u.epModalData.tmdbId}
					showTitle={u.epModalData.showTitle}
					showPosterPath={u.epModalData.showPosterPath}
					showBackdropPath={u.epModalData.showBackdropPath}
					episodes={u.epModalData.episodes}
					initialIndex={u.epModalData.initialIndex}
					watchedKeys={u.epModalData.watchedKeys}
					currentNextEpisode={u.epModalData.currentNextEpisode}
					readOnly
					onMarkWatched={async () => {}}
					onMarkWatchedThrough={async () => {}}
					onUnmarkWatched={async () => {}}
					onLoadEpisodeDetails={u.handleLoadEpisodeDetails}
					onShowPress={u.handleEpModalShowPress}
					onClose={() => {
						u.setEpModalVisible(false);
						u.setEpModalData(null);
					}}
				/>
			)}
			<ShowDrawer
				visible={u.drawerVisible}
				show={u.drawerShow}
				onGoToShow={
					u.drawerShow?.tmdbId
						? () => {
								const id = u.drawerShow!.tmdbId!;
								u.setDrawerVisible(false);
								u.setDrawerShow(null);
								goToShow(id);
							}
						: undefined
				}
				onClose={() => {
					u.setDrawerVisible(false);
					u.setDrawerShow(null);
				}}
			/>
		</>
	);
}
