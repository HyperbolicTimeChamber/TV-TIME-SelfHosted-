import type { CSSProperties } from "react";
import { useElementWidth } from "../../hooks/useElementWidth";
import styles from "./styles/WatchRate.module.scss";

interface DayData {
	day: string;
	label: string;
	episodes: number;
	movies: number;
}

const EPISODE_COLOR = "var(--primary)";
const MOVIE_COLOR = "var(--movie-purple)";

/** The app's chart row on a 390pt phone; its sizes below are for that width */
const BASE_WIDTH = 326;
const CHART_HEIGHT = 130;
const BAR_WIDTH = 10;
/** A bar's column: the bar plus room for its count labels */
const COLUMN_WIDTH = 40;
/** One count label's line and size; a day's two stack one line apart */
const LABEL_LINE = 13;
const LABEL_FONT = 11;
const DAY_FONT = 10;
/** Space between a bar's top and its count */
const LABEL_GAP = 6;
const GROW_STAGGER_MS = 60;
const RATE_STAGGER_MS = 80;

/**
 * Sizes for a chart row `width` wide. The chart keeps the app's proportions: on a wide screen
 * the bars grow taller and thicker instead of spreading apart. Never smaller than the app's.
 * Counts grow half as fast, so they stay labels rather than headlines.
 */
function chartSizes(width: number) {
	const scale = Math.max(1, width / BASE_WIDTH);
	const labelScale = 1 + (scale - 1) / 2;
	const barWidth = BAR_WIDTH * scale;
	return {
		scale,
		chartHeight: CHART_HEIGHT * scale,
		barWidth,
		/** Shortest a non-empty bar gets, so a 1 next to a 40 still reads as a bar */
		minBarHeight: barWidth * 2,
		columnWidth: COLUMN_WIDTH * scale,
		labelLine: LABEL_LINE * labelScale,
		labelFont: LABEL_FONT * labelScale,
		dayFont: DAY_FONT * labelScale,
		labelGap: LABEL_GAP * scale,
	};
}
type ChartSizes = ReturnType<typeof chartSizes>;

/** Bar height on a square-root scale, as the app's: a big day doesn't squash the small ones into dots */
const barHeight = (value: number, max: number, size: ChartSizes) =>
	value > 0 ? Math.max(size.minBarHeight, Math.sqrt(value / max) * size.chartHeight) : 0;

/** Weekly Watch Rate + Daily Watch Rate — same data and scales as the app's Profile charts */
export default function WatchRate({
	data,
	loading = false,
}: Readonly<{
	data: DayData[];
	/** The week is still being fetched: an empty one isn't known to be empty yet */
	loading?: boolean;
}>) {
	const week = data.reduce(
		(sum, d) => ({ episodes: sum.episodes + d.episodes, movies: sum.movies + d.movies }),
		{ episodes: 0, movies: 0 },
	);
	// Nothing this week: one chart, not two rows of zeros over an empty one
	const empty = week.episodes + week.movies === 0;
	const peak = Math.max(week.episodes, week.movies, 1);

	const [rowRef, rowWidth] = useElementWidth<HTMLDivElement>();
	const size = chartSizes(rowWidth);

	const maxVal = Math.max(1, ...data.map((d) => Math.max(d.episodes, d.movies)));
	// Room above the chart for whichever day's count labels reach highest: a day with two labels
	// can stand taller than the peak day with one. No dead space under the title otherwise
	const labelRoom = Math.max(
		0,
		...data.map((d) => {
			const labels = Number(d.episodes > 0) + Number(d.movies > 0);
			if (!labels) return 0;
			const top = barHeight(Math.max(d.episodes, d.movies), maxVal, size);
			return top + size.labelGap + labels * size.labelLine - size.chartHeight;
		}),
	);

	return (
		// Bars grow in whenever they mount — each visit to the page (the app does it once per launch)
		<div className={`${styles.root} ${styles.intro}`}>
			{!empty && (
				<section className={styles.rate}>
					<h3 className={styles.title}>Weekly Watch Rate</h3>
					<RateRow
						label="Episodes"
						value={week.episodes}
						share={Math.sqrt(week.episodes / peak)}
						color={EPISODE_COLOR}
						delay={0}
					/>
					<RateRow
						label="Movies"
						value={week.movies}
						share={Math.sqrt(week.movies / peak)}
						color={MOVIE_COLOR}
						delay={RATE_STAGGER_MS}
					/>
				</section>
			)}

			<section className={empty ? undefined : styles.chart}>
				<h3 className={`${styles.title} ${styles.chartTitle}`}>
					{empty ? "Weekly Watch Rate" : "Daily Watch Rate"}
				</h3>
				<div
					ref={rowRef}
					className={styles.chartRow}
					style={
						{
							paddingTop: labelRoom,
							"--scale": size.scale,
							"--bar-w": `${size.barWidth}px`,
							"--col-w": `${size.columnWidth}px`,
							"--label-font": `${size.labelFont}px`,
							"--label-line": `${size.labelLine}px`,
							"--day-font": `${size.dayFont}px`,
						} as CSSProperties
					}
				>
					{/* The message waits for the week to load: until then empty isn't known to be empty */}
					{empty && !loading && (
						<p className={styles.emptyText} style={{ height: size.chartHeight }}>
							Nothing watched in the last 7 days
						</p>
					)}
					{data.map((day, i) => {
						const epH = barHeight(day.episodes, maxVal, size);
						const movH = barHeight(day.movies, maxVal, size);
						// Taller one behind, shorter in front
						const bars = [
							{ kind: "ep", h: epH, color: EPISODE_COLOR },
							{ kind: "mov", h: movH, color: MOVIE_COLOR },
						].sort((a, b) => b.h - a.h);
						// Counts above the bars in their bar's colour, the higher value on top
						const labels = [
							{ kind: "ep", value: day.episodes, color: EPISODE_COLOR },
							{ kind: "mov", value: day.movies, color: MOVIE_COLOR },
						]
							.filter((l) => l.value > 0)
							.sort((a, b) => a.value - b.value);
						const delay = { "--delay": `${i * GROW_STAGGER_MS}ms` } as CSSProperties;

						return (
							<div key={day.day} className={styles.barGroup}>
								<div className={styles.barColumn} style={{ height: size.chartHeight }}>
									<div className={styles.grow} style={delay}>
										{bars.map(
											(b) =>
												b.h > 0 && (
													<div
														key={b.kind}
														className={styles.bar}
														style={{ height: b.h, "--color": b.color } as CSSProperties}
													/>
												),
										)}
										{day.episodes + day.movies === 0 && <div className={styles.emptyNub} />}
									</div>
									<div className={styles.counts} style={delay}>
										{labels.map((l, n) => (
											<span
												key={l.kind}
												className={styles.count}
												style={
													{
														bottom: Math.max(epH, movH) + size.labelGap + n * size.labelLine,
														"--color": l.color,
													} as CSSProperties
												}
											>
												{l.value}
											</span>
										))}
									</div>
								</div>
								<span className={styles.dayLabel}>{day.label}</span>
							</div>
						);
					})}
				</div>
				{/* No legend of its own: the Weekly Watch Rate rows above name both colours */}
			</section>
		</div>
	);
}

function RateRow({
	label,
	value,
	share,
	color,
	delay,
}: Readonly<{ label: string; value: number; share: number; color: string; delay: number }>) {
	return (
		<div>
			<div className={styles.rowHeader}>
				<span className={styles.rowLabel}>
					<span className={styles.swatch} style={{ background: color }} />
					{label}
				</span>
				<span className={styles.value}>{value}</span>
			</div>
			<div className={styles.track}>
				{value <= 0 ? (
					<div className={styles.stub} />
				) : (
					<div
						className={styles.rateBar}
						style={
							{
								width: `${Math.max(share, 0.02) * 100}%`,
								"--color": color,
								"--delay": `${delay}ms`,
							} as CSSProperties
						}
					/>
				)}
			</div>
		</div>
	);
}
