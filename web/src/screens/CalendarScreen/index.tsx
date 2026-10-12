import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IoChevronBack, IoChevronForward } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { useCalendarScreen, YEARS } from "@app/screens/useCalendarScreen";
import { MediaType } from "@app/enums";
import { todayStr } from "@app/utils/todayStr";
import PosterImage from "../../components/PosterImage";
import AnimatedModal from "../../components/AnimatedModal";
import LoadingScreen from "../../components/LoadingScreen";
import { showPath } from "../../routes/paths";
import styles from "../../styles/screens/CalendarScreen/CalendarScreen.module.scss";
import { monthGrid } from "./monthGrid";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Calendar tab — same state/data as the app via useCalendarScreen */
export default function CalendarScreen() {
	const navigate = useNavigate();
	const c = useCalendarScreen();
	const today = todayStr();
	const yearListRef = useRef<HTMLDivElement>(null);
	const grid = useMemo(() => monthGrid(c.currentYear, c.currentMonth), [c.currentYear, c.currentMonth]);
	const monthKey = `${c.currentYear}-${c.currentMonth}`;

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
									className={`${styles.dayNumber} ${cell.date === today && !selected ? styles.today : ""}`}
									style={selected ? { background: mark?.selectedColor } : undefined}
								>
									{cell.day}
								</span>
								<span
									className={styles.dot}
									style={{ background: mark?.marked && cell.inMonth ? mark.dotColor : "transparent" }}
								/>
							</button>
						);
					})}
				</motion.div>
			</AnimatePresence>

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
