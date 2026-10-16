import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IoChevronBack, IoChevronForward } from "react-icons/io5";
import { IoIosArrowDown } from "react-icons/io";
import { NavigationType, useNavigate, useNavigationType } from "react-router-dom";
import { useCalendarScreen, YEARS, type CalendarEpisode, type CalendarPosition } from "@app/screens/useCalendarScreen";
import { withAirTime } from "@app/utils/airTime";
import { groupCalendarDay, episodeCountLabel, seasonRangeLabel } from "@app/utils/calendarGroups";
import { MediaType } from "@app/enums";
import { todayStr } from "@app/utils/todayStr";
import { tmdbBackdropUri, tmdbLogoUri } from "@app/hooks/useTmdbImage";
import AnimatedModal from "../../components/AnimatedModal";
import { showPath } from "../../routes/paths";
import styles from "./styles/CalendarScreen.module.scss";
import { monthGrid } from "./monthGrid";
import { cssVars } from "../../utils/cssVars";

/** Widest a day card gets (desktop list pane ≈ 440) — × devicePixelRatio picks the TMDB size */
const CARD_MAX_WIDTH = 440;

const POSITION_KEY = "calendar_position";
const readPosition = (): CalendarPosition | null => {
	try {
		return JSON.parse(sessionStorage.getItem(POSITION_KEY) ?? "null");
	} catch {
		return null;
	}
};
const savePosition = (p: CalendarPosition) => {
	try {
		sessionStorage.setItem(POSITION_KEY, JSON.stringify(p));
	} catch {
		// private mode etc. — back just starts at today
	}
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Desktop: shows (red) / movies (purple) airing that day — replaces the dot */
function DayCounts({ counts }: { counts?: { shows: Set<number>; movies: number } }) {
	const shows = counts?.shows.size ?? 0;
	const movies = counts?.movies ?? 0;
	return (
		<span className={styles.counts} aria-hidden={!shows && !movies}>
			{shows > 0 && (
				<span className={`${styles.count} bg-primary`} aria-label={`${shows} shows`}>
					{shows} {shows === 1 ? "Show" : "Shows"}
				</span>
			)}
			{movies > 0 && (
				<span className={`${styles.count} bg-movie`} aria-label={`${movies} movies`}>
					{movies} {movies === 1 ? "Movie" : "Movies"}
				</span>
			)}
		</span>
	);
}
const pad = (n: number) => String(n).padStart(2, "0");
const SKELETON_CARDS = 3;
// Same as the app's accordion timing
const ACCORDION_S = 0.22;

interface DayCardProps {
	ep: CalendarEpisode;
	/** Set when this card stands for several of the show's episodes that day */
	groupEps?: CalendarEpisode[];
	expanded?: boolean;
	/** Episode listed under an opened show card */
	child?: boolean;
	onClick: () => void;
}

/** Day list card: backdrop, logo/name, episode title (or range) + the right-hand square */
function DayCard({ ep, groupEps, expanded, child, onClick }: DayCardProps) {
	const isMovie = ep.mediaType === MediaType.MOVIE;
	const backdrop = (
		<>
			{/* Same backdrop treatment as the Watch History cards */}
			{ep.backdropPath && (
				<img src={tmdbBackdropUri(ep.backdropPath, CARD_MAX_WIDTH)} alt="" className={styles.cardBg} loading="lazy" />
			)}
			<span className={styles.cardOverlay} />
		</>
	);

	// Episode under an opened show card: one line, Exx then its name
	if (child) {
		return (
			<button className={styles.childRow} onClick={onClick}>
				<span className={styles.childEp}>E{pad(ep.episode)}</span>
				<span className={styles.childTitle}>{ep.episodeTitle}</span>
			</button>
		);
	}

	return (
		<button className={styles.episodeRow} onClick={onClick} aria-expanded={groupEps ? !!expanded : undefined}>
			{backdrop}
			<span className={styles.epInfo}>
				{/* Title logo when TMDB has one, else the name */}
				{ep.logoPath ? (
					<img src={tmdbLogoUri(ep.logoPath, CARD_MAX_WIDTH * 0.6)} alt={ep.showTitle} className={styles.logo} loading="lazy" />
				) : (
					<span className={styles.showTitle}>{ep.showTitle}</span>
				)}
				{isMovie ? (
					<span className={styles.movieBadge}>MOVIE</span>
				) : (
					// Collapsed show: its season(s) where an episode name would be; count is in the square
					<span className={styles.epTitle}>{withAirTime(groupEps ? seasonRangeLabel(groupEps) : ep.episodeTitle, ep.airStamp)}</span>
				)}
			</span>
			{groupEps ? (
				// Collapsed show: same square, a dropdown arrow (flips when open) in place of Exx
				<span className={styles.epSquare}>
					<span className={styles.epSquareTitle}>{episodeCountLabel(groupEps).toUpperCase()}</span>
					<span className={styles.epSquareRule} />
					<span className={styles.epSquareArrow}>
						<IoIosArrowDown size={40} className={`relative transition-transform duration-220 ${expanded ? "rotate-180" : ""}`} />
					</span>
				</span>
			) : (
				// Right square: SEASON xx over a big Exx; movies their release year
				<span className={styles.epSquare}>
					<span className={styles.epSquareTitle}>{isMovie ? "YEAR" : `SEASON ${pad(ep.season)}`}</span>
					<span className={styles.epSquareRule} />
					<span className={`${styles.epSquareValue} ${isMovie ? styles.epSquareYear : ""}`}>
						{isMovie ? ep.airDate.slice(0, 4) : `E${pad(ep.episode)}`}
					</span>
				</span>
			)}
		</button>
	);
}

/** Calendar tab — same state/data as the app via useCalendarScreen */
export default function CalendarScreen() {
	const navigate = useNavigate();
	// Back (POP) from a show page returns to the same month / day; entering from the
	// tab bar starts at today (the screen remounts either way on web)
	const navigationType = useNavigationType();
	const [initial] = useState(() => (navigationType === NavigationType.Pop ? readPosition() : null));
	const c = useCalendarScreen(initial);
	useEffect(() => {
		savePosition({ selectedDate: c.selectedDate, year: c.currentYear, month: c.currentMonth });
	}, [c.selectedDate, c.currentYear, c.currentMonth]);
	// Open show groups; closed again when another day is picked
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	useEffect(() => setExpanded(new Set()), [c.selectedDate]);
	const toggleGroup = (key: string) =>
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	const openShow = (ep: CalendarEpisode) =>
		navigate(showPath(ep.mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV, ep.tmdbShowId));
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
					/* Same shimmer timing as the app's shared skeleton pulse */
					<section className={styles.episodeList} aria-busy>
						<span className={`${styles.skeleton} ${styles.skeletonHeader}`} />
						{Array.from({ length: SKELETON_CARDS }, (_, i) => (
							<span key={i} className={`${styles.skeleton} ${styles.skeletonCard}`} />
						))}
					</section>
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
								// Shows with several episodes that day collapse into one card; click to open
								groupCalendarDay(c.selectedEpisodes).map((group) => {
									const open = expanded.has(group.key);
									const isGroup = group.episodes.length > 1;
									return (
										<Fragment key={group.key}>
											<DayCard
												ep={group.first}
												groupEps={isGroup ? group.episodes : undefined}
												expanded={open}
												onClick={() => (isGroup ? toggleGroup(group.key) : openShow(group.first))}
											/>
											{/* Accordion: strips slide open/closed, cards below follow the height */}
											<AnimatePresence initial={false}>
												{isGroup && open && (
													<motion.div
														key="strips"
														className="overflow-hidden"
														initial={{ height: 0, opacity: 0 }}
														animate={{ height: "auto", opacity: 1 }}
														exit={{ height: 0, opacity: 0 }}
														transition={{ duration: ACCORDION_S, ease: "easeInOut" }}
													>
														{group.episodes.map((ep) => (
															<DayCard key={`${ep.season}_${ep.episode}`} ep={ep} child onClick={() => openShow(ep)} />
														))}
													</motion.div>
												)}
											</AnimatePresence>
										</Fragment>
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
