import React, { useEffect, useId, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
	Defs,
	FeGaussianBlur,
	Filter,
	LinearGradient as SvgGradient,
	Rect,
	Stop,
} from "react-native-svg";
import { colors, spacing, tint, typography } from "../theme";

interface DayData {
	label: string;
	episodes: number;
	movies: number;
}

interface Props {
	data: DayData[];
	/** Grow the bars in from the baseline (the Profile screen's first appearance after launch) */
	animate?: boolean;
}

const GROW_MS = 450;
const GROW_STAGGER_MS = 60;

/** One value per day, each growing 0 → 1 from the chart baseline, a beat apart */
function useGrow(count: number, animate: boolean) {
	const bars = useRef<Animated.Value[]>([]);
	if (bars.current.length !== count) {
		bars.current = Array.from({ length: count }, () => new Animated.Value(animate ? 0 : 1));
	}

	useEffect(() => {
		if (!animate) return;
		const values = bars.current;
		// `animate` can turn on after mount (this screen is preloaded offscreen), so drop the
		// bars back to the baseline before growing them
		values.forEach((v) => v.setValue(0));
		let cancelled = false;
		AccessibilityInfo.isReduceMotionEnabled()
			.catch(() => false)
			.then((reduced) => {
				if (cancelled) return;
				if (reduced) {
					values.forEach((v) => v.setValue(1));
					return;
				}
				Animated.stagger(
					GROW_STAGGER_MS,
					values.map((v) =>
						Animated.timing(v, {
							toValue: 1,
							duration: GROW_MS,
							easing: Easing.out(Easing.cubic),
							useNativeDriver: true,
						}),
					),
				).start();
			});
		return () => {
			cancelled = true;
		};
	}, [animate, count]);

	return bars.current;
}

const CHART_HEIGHT = 130;
const GLOW_HEIGHT = 24;
const TOTAL_HEIGHT = CHART_HEIGHT + GLOW_HEIGHT;
const BAR_WIDTH = 10;
const SVG_W = BAR_WIDTH + 30;

/** Glow alpha by distance from the baseline (0) to the tip (1): eased, so it never bands */
export const GLOW_STOPS = [
	[0, 0.9],
	[0.15, 0.7],
	[0.35, 0.42],
	[0.6, 0.18],
	[0.8, 0.06],
	[1, 0],
] as const;
const GLOW_W = BAR_WIDTH * 2.6;
const GLOW_BLUR = 8;
/** Room either side of the bar's column for the blur to fall off before the canvas edge */
const GLOW_PAD = GLOW_BLUR * 3;
const GLOW_SVG_W = SVG_W + GLOW_PAD * 2;

/**
 * One day's bar: bright at the baseline, fading toward the tip, glowing into the dark. The glow
 * is a single blurred column whose own gradient fades out, rather than stacked boxShadows, which
 * left visible bands where each layer ended.
 */
function GlowBar({ color, height }: Readonly<{ color: string; height: number }>) {
	const id = useId().replace(/:/g, "");
	if (height <= 0) return null;
	const svgH = height + GLOW_HEIGHT;
	return (
		<>
			<Svg width={GLOW_SVG_W} height={svgH} style={styles.glow} pointerEvents="none">
				<Defs>
					<SvgGradient id={`fade${id}`} x1="0" y1="1" x2="0" y2="0">
						{GLOW_STOPS.map(([offset, alpha]) => (
							<Stop key={offset} offset={offset} stopColor={color} stopOpacity={alpha} />
						))}
					</SvgGradient>
					<Filter
						id={`blur${id}`}
						filterUnits="userSpaceOnUse"
						x={0}
						y={0}
						width={GLOW_SVG_W}
						height={svgH}
					>
						<FeGaussianBlur stdDeviation={GLOW_BLUR} />
					</Filter>
				</Defs>
				<Rect
					x={(GLOW_SVG_W - GLOW_W) / 2}
					y={0}
					width={GLOW_W}
					height={height}
					rx={GLOW_W / 2}
					fill={`url(#fade${id})`}
					filter={`url(#blur${id})`}
				/>
			</Svg>
			<View style={[styles.bar, { height }]}>
				<LinearGradient
					colors={[tint(color, 0.08), tint(color, 0.3), tint(color, 0.7), color]}
					locations={[0, 0.35, 0.7, 1]}
					style={styles.barFill}
				/>
			</View>
		</>
	);
}

export default function WeeklyChart({ data, animate = false }: Readonly<Props>) {
	const maxEp = Math.max(0, ...data.map((d) => d.episodes));
	const maxMov = Math.max(0, ...data.map((d) => d.movies));
	const maxVal = Math.max(1, maxEp, maxMov);
	const hasData = data.some((d) => d.episodes > 0 || d.movies > 0);
	const grow = useGrow(data.length, animate);

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Daily Watch Rate</Text>
			{!hasData && (
				<Text style={styles.emptyText}>Your Weekly Watch Data will appear here Shortly</Text>
			)}
			<View style={styles.chartRow}>
				{data.map((day, i) => {
					const epH = (day.episodes / maxVal) * CHART_HEIGHT;
					const movH = (day.movies / maxVal) * CHART_HEIGHT;
					const total = day.episodes + day.movies;

					// Taller one behind, shorter in front
					const epBehind = epH >= movH;

					return (
						<View key={day.label} style={styles.barGroup}>
							<View style={styles.barPair}>
								{/* Grown from the chart baseline, so the bars rise out of their own glow */}
								<Animated.View
									style={[
										styles.barStack,
										{ transformOrigin: "bottom", transform: [{ scaleY: grow[i] }] },
									]}
								>
									{/* Taller behind, shorter in front */}
									<GlowBar
										color={epBehind ? colors.primary : colors.moviePurple}
										height={epBehind ? epH : movH}
									/>
									<GlowBar
										color={epBehind ? colors.moviePurple : colors.primary}
										height={epBehind ? movH : epH}
									/>
									{total === 0 && <View style={styles.emptyNub} />}
								</Animated.View>
								<Animated.View
									style={[StyleSheet.absoluteFill, { opacity: grow[i] }]}
									pointerEvents="none"
								>
									{day.episodes > 0 && (
										<Text
											style={[
												styles.countLabel,
												{
													position: "absolute",
													bottom: GLOW_HEIGHT + epH + 6,
													left: 0,
													width: SVG_W,
												},
											]}
										>
											{day.episodes}
										</Text>
									)}
									{day.movies > 0 && (
										<Text
											style={[
												styles.countLabel,
												{
													position: "absolute",
													bottom:
														GLOW_HEIGHT + movH + (Math.abs(movH - epH) < 16 && epH > 0 ? 20 : 6),
													left: 0,
													width: SVG_W,
												},
											]}
										>
											{day.movies}
										</Text>
									)}
								</Animated.View>
							</View>
							<Text style={styles.dayLabel}>{day.label}</Text>
						</View>
					);
				})}
			</View>
			<View style={styles.legend}>
				<View style={styles.legendItem}>
					<View style={[styles.legendSwatch, { backgroundColor: colors.primary }]} />
					<Text style={styles.legendText}>Episodes</Text>
				</View>
				<View style={styles.legendItem}>
					<View style={[styles.legendSwatch, { backgroundColor: colors.moviePurple }]} />
					<Text style={styles.legendText}>Movies</Text>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		backgroundColor: "transparent",
		borderRadius: 12,
		padding: spacing.lg,
		marginHorizontal: spacing.lg,
	},
	title: {
		...typography.subtitle,
		marginBottom: spacing.md,
	},
	chartRow: {
		// Room for the tallest bar's count labels (up to 2 stacked) above the bars
		paddingTop: spacing.xxl + spacing.xs,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-end",
	},
	barGroup: {
		alignItems: "center",
		flex: 1,
	},
	barPair: {
		height: TOTAL_HEIGHT,
		width: SVG_W,
		justifyContent: "flex-end",
	},
	// Both bars share the baseline; the glow blooms past it into the gap below
	barStack: {
		height: CHART_HEIGHT,
		width: SVG_W,
		marginBottom: GLOW_HEIGHT,
		justifyContent: "flex-end",
		alignItems: "center",
	},
	// Hangs below the baseline so the base's bloom spills into the gap under the bars
	glow: {
		position: "absolute",
		bottom: -GLOW_HEIGHT,
		left: -GLOW_PAD,
	},
	bar: {
		position: "absolute",
		bottom: 0,
		width: BAR_WIDTH,
		borderRadius: BAR_WIDTH / 2,
		overflow: "hidden",
	},
	barFill: {
		flex: 1,
	},
	emptyNub: {
		width: BAR_WIDTH,
		height: 4,
		borderRadius: 2,
		backgroundColor: colors.surfaceLight,
	},
	emptyText: {
		...typography.caption,
		textAlign: "center",
		marginBottom: spacing.md,
	},
	dayLabel: {
		...typography.caption,
		fontSize: 10,
		marginTop: spacing.xs,
	},
	countLabel: {
		...typography.caption,
		fontSize: 10,
		fontWeight: "600",
		color: colors.text,
		textAlign: "center",
	},
	legend: {
		flexDirection: "row",
		gap: spacing.lg,
		marginTop: spacing.md,
	},
	legendItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	legendSwatch: {
		width: 12,
		height: 12,
		borderRadius: 6,
	},
	legendText: {
		...typography.caption,
		fontSize: 10,
	},
});
