import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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
/** Room round a bar's column for its glow: a GPU-cached view is clipped to its own bounds */
const GLOW_PAD = 28;

/**
 * A single boxShadow is uniform all round the box, so it halos the tip as brightly as the base.
 * Stacking shorter boxes from the axis, each with a wider spread, piles the light up where the
 * bar starts. Many faint layers rather than a few strong ones: each layer is far shorter than
 * its blur, so their ends melt together and the glow fades without visible steps.
 */
const GLOW_STEPS = 10;
const GLOW_LAYERS = Array.from({ length: GLOW_STEPS }, (_, i) => {
	const t = i / GLOW_STEPS;
	return {
		frac: 1 - t,
		// Climbs steeply near the axis, so the base glows nearly as bright as the bar and the two blend
		alpha: 0.04 + 0.5 * t * t,
		blur: BAR_WIDTH * (2.2 - 0.8 * t),
		spread: BAR_WIDTH * 0.8 * t,
	};
});
/** An outset shadow is cut out of its own box, so a bar-wide layer leaves a hole in the glow
 *  that shows through the bar's faded top. Drawing each layer from a hairline core tucked under
 *  the bar, with the difference added to its spread, with the core itself filled in, keeps the same shape without the hole. */
const GLOW_CORE = 2;
/** The blur thins a shadow at its source, so a core filled at full strength reads as a bright seam */
const CORE_FILL = 0.55;
const CORE_SPREAD = (BAR_WIDTH - GLOW_CORE) / 2;

/** One day's bar: bright at the baseline, fading toward the tip, glowing into the dark */
function GlowBar({ color, height }: Readonly<{ color: string; height: number }>) {
	if (height <= 0) return null;
	return (
		<>
			{/* A short bar can't fit every step; the ones that would be squashed to the floor just pile up */}
			{GLOW_LAYERS.filter((layer, i) => i === 0 || height * layer.frac >= BAR_WIDTH).map(
				(layer) => (
					<View
						key={layer.frac}
						style={[
							styles.bar,
							{
								height: Math.max(height * layer.frac, BAR_WIDTH) - CORE_SPREAD,
								bottom: CORE_SPREAD,
								width: GLOW_CORE,
								borderRadius: GLOW_CORE / 2,
								// Fills the core's own cut-out to match the blurred shadow around it
								backgroundColor: tint(color, layer.alpha * CORE_FILL),
								// Spread, not a wider box, so the glow thickens toward the axis while the bar stays slim
								boxShadow: `0 0 ${layer.blur}px ${layer.spread + CORE_SPREAD}px ${tint(color, layer.alpha)}`,
							},
						]}
					/>
				),
			)}
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
										styles.glowCanvas,
										{
											// The baseline, inside the canvas's padding
											transformOrigin: `50% ${GLOW_PAD + CHART_HEIGHT}px`,
											transform: [{ scaleY: grow[i] }],
										},
									]}
									// The stacked glow shadows are costly to draw: paint them once into a
									// GPU texture, so growing the bar only stretches that
									renderToHardwareTextureAndroid
									shouldRasterizeIOS
								>
									<View style={styles.barStack}>
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
									</View>
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
	// The bar's GPU-cached layer, big enough for its glow: the padding holds the glow, the
	// matching negative margins keep the layout as if it were just the bar's column
	glowCanvas: {
		marginHorizontal: -GLOW_PAD,
		marginTop: -GLOW_PAD,
		paddingHorizontal: GLOW_PAD,
		paddingTop: GLOW_PAD,
		// The bloom spills into the gap under the baseline
		paddingBottom: GLOW_HEIGHT,
	},
	barStack: {
		height: CHART_HEIGHT,
		width: SVG_W,
		justifyContent: "flex-end",
		alignItems: "center",
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
