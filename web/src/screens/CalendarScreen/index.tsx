import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IoChevronBack, IoChevronForward } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { useCalendarScreen, YEARS } from "@app/screens/useCalendarScreen";
import { MediaType } from "@app/enums";
import { todayStr } from "@app/utils/todayStr";
import PosterImage from "../../components/PosterImage";
import { tmdbBackdropUri } from "@app/hooks/useTmdbImage";
import AnimatedModal from "../../components/AnimatedModal";
import LoadingScreen from "../../components/LoadingScreen";
import { showPath } from "../../routes/paths";
import styles from "./styles/CalendarScreen.module.scss";
import { monthGrid } from "./monthGrid";
import { cssVars } from "../../utils/cssVars";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Desktop: shows (red) / movies (purple) airing that day — replaces the dot */
function DayCounts({ counts }: { counts?: { shows: Set<number>; movies: number } }) {
	const shows = counts?.shows.size ?? 0;
	const movies = counts?.movies ?? 0;
	return (
		<span className={styles.counts} aria-hidden={!shows && !movies}>
			{shows > 0 && (
				<span className={`${styles.count} bg-primary`} aria-label={`${shows} shows`}>
					{shows} {shows === 1 ? "show" : "shows"}
				</span>
			)}
			{movies > 0 && (
				<span className={`${styles.count} bg-movie`} aria-label={`${movies} movies`}>
					{movies} {movies === 1 ? "movie" : "movies"}
				</span>
			)}
		</span>
	);
}
const pad = (n: number) => String(n).padStart(2, "0");

/** Calendar tab — same state/data as the app via useCalendarScreen */
export default function CalendarScreen() {
	const navigate = useNavigate();
	const c = useCalendarScreen();
	const today = todayStr();
	const yearListRef = useRef<HTMLDivElement>(null);
	const grid = useMemo(() => monthGrid(c.currentYear, c.currentMonth), [c.currentYear, c.currentMonth]);
	const monthKey = `${c.currentYear}-${c.currentMonth}`;
	// Desktop day cells show counts instead of a dot: distinct shows + movies per date
	const countsByDate = useMemo(() => {
		const map = new Map<string, { shows: Set<number>; movies: number }>();
		for (const ep of c.episodes) {
			const day = map.get(ep.airDate) ?? { shows: new Set<number>(), movies: 0 };
			if (ep.mediaType === MediaType.MOVIE) day.movies++;
			else day.shows.add(ep.tmdbShowId);
			map.set(ep.airDate, day);
		}
		return map;
	}, [c.episodes]);

	const shiftMonth = (delta: number) => {
		const d = new Date(c.currentYear, c.currentMonth - 1 + delta, 1);
		c.handleMonthChange(d.getFullYear(), d.getMonth() + 1);
	};

	// Year picker opens centred on the current year
	useEffect(() => {
		if (!c.yearModalVisible) return;
		requestAnimationFrame(() =>
			yearListRef.current?.querySelector(`[data-year="${c.currentYear}"]`)?.scrollIntoView({ block: "center" }),
		);
	}, [c.yearModalVisible, c.currentYear]);

	return (
		<div className={styles.container}>
			{/* Desktop: calendar left, the day's list right; stacked below that */}
			<div className={styles.calendarPane}>
				<div className={styles.header}>
					<button className={styles.arrow} onClick={() => shiftMonth(-1)} aria-label="Previous month">
						<IoChevronBack size={20} />
					</button>
					<button className={styles.headerTitle} onClick={() => c.setYearModalVisible(true)}>
						{c.monthLabel}
					</button>
					<button className={styles.arrow} onClick={() => shiftMonth(1)} aria-label="Next month">
						<IoChevronForward size={20} />
					</button>
				</div>
				<div className={styles.weekdays}>
					{WEEKDAYS.map((d) => (
						<span key={d}>{d}</span>
					))}
				</div>
				<AnimatePresence mode="wait" initial={false}>
					<motion.div
						key={monthKey}
						className={styles.grid}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						drag="x"
						dragConstraints={{ left: 0, right: 0 }}
						dragElastic={0.3}
						onDragEnd={(_, info) => {
							if (info.offset.x < -60) shiftMonth(1);
							else if (info.offset.x > 60) shiftMonth(-1);
						}}
					>
						{grid.map((cell) => {
							const mark = c.markedDates[cell.date];
							const selected = cell.date === c.selectedDate;
							return (
								<button
									key={cell.date}
									className={`${styles.day} ${cell.inMonth ? "" : styles.dayOut}`}
									onClick={() => (cell.inMonth ? c.handleDayPress(cell.date) : null)}
									disabled={!cell.inMonth}
									aria-label={cell.date}
									aria-pressed={selected}
								>
									<span
										className={`${styles.dayNumber} ${cell.date === today && !selected ? styles.today : ""} ${selected ? "bg-(--sel)!" : ""}`}
										style={selected ? cssVars({ "--sel": mark?.selectedColor ?? "transparent" }) : undefined}
									>
										{cell.day}
									</span>
									<span
										className={`${styles.dot} bg-(--dot)!`}
										style={cssVars({ "--dot": mark?.marked && cell.inMonth ? mark.dotColor : "transparent" })}
									/>
									{cell.inMonth && <DayCounts counts={countsByDate.get(cell.date)} />}
								</button>
							);
						})}
					</motion.div>
				</AnimatePresence>
				<div className={styles.legend} aria-hidden>
					<span>
						<span className={`${styles.legendSwatch} bg-primary`} /> Shows
					</span>
					<span>
						<span className={`${styles.legendSwatch} bg-movie`} /> Movies
					</span>
				</div>
			</div>

			<div className={styles.listPane}>
				{c.loading ? (
					<LoadingScreen label="Checking your calendar..." />
				) : (
					c.selectedDate && (
						<section className={styles.episodeList}>
							<h3 className={styles.dateHeader}>
								{new Date(`${c.selectedDate}T00:00:00`).toLocaleDateString("en-US", {
									weekday: "long",
									month: "long",
									day: "numeric",
								})}
							</h3>
							{c.selectedEpisodes.length === 0 ? (
								<p className={styles.noEps}>No episodes on this day</p>
							) : (
								c.selectedEpisodes.map((ep) => {
									const isMovie = ep.mediaType === MediaType.MOVIE;
									return (
										<button
											key={`${ep.tmdbShowId}_${ep.season}_${ep.episode}`}
											className={styles.episodeRow}
											onClick={() => navigate(showPath(isMovie ? MediaType.MOVIE : MediaType.TV, ep.tmdbShowId))}
										>
											{/* Same backdrop treatment as the Watch History cards */}
										{ep.backdropPath && (
											<img src={tmdbBackdropUri(ep.backdropPath, 600)} alt="" className={styles.cardBg} loading="lazy" />
										)}
										<span className={styles.cardOverlay} />
										<PosterImage posterPath={ep.posterPath} mediaType={ep.mediaType} className={styles.poster} />
											<span className={styles.epInfo}>
												<span className={styles.showTitle}>{ep.showTitle}</span>
												{isMovie ? (
													<span className={styles.movieBadge}>MOVIE</span>
												) : (
													<>
														<span className={styles.epLabel}>
															S{pad(ep.season)}E{pad(ep.episode)}
														</span>
														<span className={styles.epTitle}>{ep.episodeTitle}</span>
													</>
												)}
											</span>
										</button>
									);
								})
							)}
						</section>
					)
				)}
			</div>

			<AnimatedModal visible={c.yearModalVisible} onClose={() => c.setYearModalVisible(false)} width={200}>
				<p className={styles.modalTitle}>Select Year</p>
				<div className={styles.yearList} ref={yearListRef}>
					{YEARS.map((y) => (
						<button
							key={y}
							data-year={y}
							className={`${styles.yearItem} ${y === c.currentYear ? styles.yearItemActive : ""}`}
							onClick={() => c.selectYear(y)}
						>
							{y}
						</button>
					))}
				</div>
			</AnimatedModal>
		</div>
	);
}
