import { motion } from "motion/react";
import { colors } from "../theme";
import styles from "../styles/components/WeeklyChart.module.scss";

interface DayData {
	label: string;
	episodes: number;
	movies: number;
}

const CHART_HEIGHT = 130;
const GLOW_HEIGHT = 24;
const TOTAL_HEIGHT = CHART_HEIGHT + GLOW_HEIGHT;
const BAR_WIDTH = 10;
const SVG_W = BAR_WIDTH + 30;
const CX = SVG_W / 2;

function Gradients({ id, color }: { id: string; color: string }) {
	return (
		<>
			<linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stopColor={color} stopOpacity="0.15" />
				<stop offset="0.4" stopColor={color} stopOpacity="0.6" />
				<stop offset="0.8" stopColor={color} stopOpacity="0.95" />
				<stop offset="1" stopColor={color} stopOpacity="1" />
			</linearGradient>
			<radialGradient id={`${id}_radial`} cx="50%" cy="30%" r="50%">
				<stop offset="0" stopColor={color} stopOpacity="0.5" />
				<stop offset="1" stopColor={color} stopOpacity="0" />
			</radialGradient>
		</>
	);
}

/** Glowing bar (same layers as the app's react-native-svg GlowBar), grows in */
function GlowBar({ id, color, height }: { id: string; color: string; height: number }) {
	if (height <= 0) return null;
	const y = CHART_HEIGHT - height;
	return (
		<motion.g
			style={{ originY: `${CHART_HEIGHT}px` }}
			initial={{ scaleY: 0 }}
			animate={{ scaleY: 1 }}
			transition={{ type: "spring", stiffness: 120, damping: 18 }}
		>
			<rect x={CX - BAR_WIDTH * 1.5} y={y + height * 0.2} width={BAR_WIDTH * 3} height={height * 0.8} rx={BAR_WIDTH * 1.5} fill={color} opacity={0.12} />
			<rect x={CX - BAR_WIDTH} y={y + height * 0.1} width={BAR_WIDTH * 2} height={height * 0.9} rx={BAR_WIDTH} fill={color} opacity={0.2} />
			<rect x={CX - BAR_WIDTH / 2} y={y} width={BAR_WIDTH} height={height} rx={BAR_WIDTH / 2} fill={`url(#${id})`} />
			<ellipse cx={CX} cy={CHART_HEIGHT + 2} rx={BAR_WIDTH * 1.8} ry={GLOW_HEIGHT * 0.55} fill={`url(#${id}_radial)`} />
		</motion.g>
	);
}

/** "Watch Statistics" weekly episodes/movies chart */
export default function WeeklyChart({ data }: { data: DayData[] }) {
	const maxVal = Math.max(1, ...data.map((d) => d.episodes), ...data.map((d) => d.movies));
	const hasData = data.some((d) => d.episodes > 0 || d.movies > 0);

	return (
		<section className={styles.container}>
			<h3 className={styles.title}>Watch Statistics</h3>
			{!hasData && <p className={styles.emptyText}>Your Weekly Watch Data will appear here Shortly</p>}
			<div className={styles.chartRow}>
				{data.map((day) => {
					const epH = (day.episodes / maxVal) * CHART_HEIGHT;
					const movH = (day.movies / maxVal) * CHART_HEIGHT;
					const epBehind = epH >= movH;
					const ep = <GlowBar key="ep" id={`ep_${day.label}`} color={colors.primary} height={epH} />;
					const mov = <GlowBar key="mov" id={`mov_${day.label}`} color={colors.moviePurple} height={movH} />;
					return (
						<div key={day.label} className={styles.barGroup}>
							<div className={styles.barPair}>
								<svg width={SVG_W} height={TOTAL_HEIGHT} aria-hidden>
									<defs>
										<Gradients id={`ep_${day.label}`} color={colors.primary} />
										<Gradients id={`mov_${day.label}`} color={colors.moviePurple} />
									</defs>
									{epBehind ? [ep, mov] : [mov, ep]}
									{day.episodes + day.movies === 0 && (
										<>
											<rect x={CX - BAR_WIDTH / 2} y={CHART_HEIGHT - 4} width={BAR_WIDTH} height={4} rx={2} fill={colors.surfaceLight} />
											<ellipse cx={CX} cy={CHART_HEIGHT + 2} rx={BAR_WIDTH} ry={GLOW_HEIGHT * 0.3} fill={colors.surfaceLight} opacity={0.1} />
										</>
									)}
								</svg>
								{day.episodes > 0 && (
									<span className={styles.countLabel} style={{ bottom: GLOW_HEIGHT + epH + 6 }}>
										{day.episodes}
									</span>
								)}
								{day.movies > 0 && (
									<span
										className={styles.countLabel}
										style={{ bottom: GLOW_HEIGHT + movH + (Math.abs(movH - epH) < 16 && epH > 0 ? 20 : 6) }}
									>
										{day.movies}
									</span>
								)}
							</div>
							<span className={styles.dayLabel}>{day.label}</span>
						</div>
					);
				})}
			</div>
			<div className={styles.legend}>
				<span className={styles.legendItem}>
					<span className={styles.swatch} style={{ background: colors.primary }} /> Episodes
				</span>
				<span className={styles.legendItem}>
					<span className={styles.swatch} style={{ background: colors.moviePurple }} /> Movies
				</span>
			</div>
		</section>
	);
}
