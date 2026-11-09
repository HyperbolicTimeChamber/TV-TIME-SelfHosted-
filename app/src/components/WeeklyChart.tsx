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
	title?: string;
	/** Centred in the chart's empty area when the week has nothing in it */
	emptyMessage?: string;
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

const CHART_HEIGHT = 160;
const GLOW_HEIGHT = 24;
const TOTAL_HEIGHT = CHART_HEIGHT + GLOW_HEIGHT;
const BAR_WIDTH = 10;
const SVG_W = BAR_WIDTH + 30;
/**
 * A bar's count as neon: the number twice, a wide glow in the bar's colour behind a pale core
 * with a tight glow of its own. One text shadow alone read as barely lit on Android.
 */
function NeonCount({
	value,
	color,
	bottom,
}: Readonly<{ value: number; color: string; bottom: number }>) {
	const place = { position: "absolute", bottom, left: 0, width: SVG_W } as const;
	return (
		<>
			<Text
				style={[styles.countLabel, place, { color, textShadowColor: color, textShadowRadius: 12 }]}
			>
				{value}
			</Text>
			<Text
				style={[
					styles.countLabel,
					place,
					{ color: lighten(color, 0.55), textShadowColor: color, textShadowRadius: 4 },
				]}
			>
				{value}
			</Text>
		</>
	);
}

/** `hex` mixed `amount` (0–1) of the way to white */
function lighten(hex: string, amount: number) {
	const mix = (i: number) => {
		const c = parseInt(hex.slice(i, i + 2), 16);
		return Math.round(c + (255 - c) * amount);
	};
	return `rgb(${mix(1)}, ${mix(3)}, ${mix(5)})`;
}

/** One count label's line; a day's two stack one line apart */
const LABEL_LINE = 13;
/** Space between a bar's top and its count */
const LABEL_GAP = 6;
/** Shortest a non-empty bar gets, so a 1 next to a 40 still reads as a bar */
const MIN_BAR_HEIGHT = BAR_WIDTH * 2;

/**
 * Bar height on a square-root scale: a big day no longer squashes the small ones into dots
 * (5 next to 43 is a third of the height, not an eighth). Order is kept and the exact count
 * sits on every bar.
 */
const barHeight = (value: number, max: number) =>
	value > 0 ? Math.max(MIN_BAR_HEIGHT, Math.sqrt(value / max) * CHART_HEIGHT) : 0;

/** Room round a bar's column for its glow: a GPU-cached view is clipped to its own bounds */
const GLOW_PAD = 52;
/** How far the canvas runs past the gap under the baseline, under the day labels, so the
 *  widened base glow fades out rather than being cut off in a straight line */
const GLOW_BELOW = 48;

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
		// Climbs steeply near the axis, so the base glows nearly as bright as the bar and the two
		// blend; faint near the tip, so the glow dies out with the bar's fade
		alpha: 0.04 + 0.5 * t * t,
		blur: BAR_WIDTH * (2.4 - 0.8 * t),
		spread: BAR_WIDTH * 0.9 * t,
	};
});
/** An outset shadow is cut out of its own box, so a bar-wide layer leaves a hole in the glow
 *  that shows through the bar's faded top. Drawing each layer from a hairline core tucked under
 *  the bar, with the difference added to its spread, with the core itself filled in, keeps the same shape without the hole. */
const GLOW_CORE = 2;
/** The blur thins a shadow at its source, so a core filled at full strength reads as a bright seam */
const CORE_FILL = 0.55;
const CORE_SPREAD = (BAR_WIDTH - GLOW_CORE) / 2;
/**
 * A pool of light on the axis under every bar, the same whatever the bar's height: wide enough
 * that neighbouring days' pools meet and merge into one glow along the bottom. Widening the
 * column layers instead turned tall bars into boxes and left short ones (which skip those
 * layers) out of it.
 */
const POOL = { height: 8, blur: 28, spread: 20, alpha: 0.2 };
/** How far up the pool's light reaches from the axis */
const POOL_REACH = POOL.spread + POOL.blur / 2;
/** Highest a glow may climb, as a share of its bar: above that the bar has faded out, and light
 *  past its tip read as a halo over nothing */
const GLOW_MAX_RISE = 0.7;
/** Bars shorter than this get proportionally tighter column glows, for the same reason */
const FULL_GLOW_HEIGHT = 80;
/** A bar's colour from base (last) to tip (first), fully faded */
const FADE_STOPS = [0, 0.1, 0.32, 0.7, 1];
const FADE_LOCATIONS = [0, 0.12, 0.4, 0.75, 1];
/** Share of a short front bar kept solid from its base, so it reads over the back one's body */
const FRONT_SOLID = 0.4;

/**
 * The shorter, front bar fades out to its tip like the back one. Well below the back bar's tip
 * it sits over that bar's bright body, where a fade from the very base washed it out into a
 * smudge (1 movie in front of 182 episodes): its lower part stays solid, shrinking to none as
 * its tip nears the back one's
 */
function frontSolid(front: number, back: number) {
	if (back <= 0) return 0;
	return FRONT_SOLID * Math.min(1, Math.max(0, 1 - front / back) / (1 - FRONT_SOLID));
}

/**
 * One day's bar: bright at the baseline, fading toward the tip, glowing into the dark. Drawn in
 * two parts so a day's glows can all go behind its bars: the front bar's glow drawn over the
 * back one hid it
 */
function GlowBar({
	color,
	height,
	part,
	solidTo = 0,
}: Readonly<{
	color: string;
	height: number;
	part: "glow" | "fill";
	/** Share of the bar (from its base) kept solid, the fade fitted above it — the back bar,
	 *  up to the front one's top, so the part that peeks out isn't already faded away */
	solidTo?: number;
}>) {
	if (height <= 0) return null;
	if (part === "fill") {
		return (
			<View style={[styles.bar, { height }]}>
				<LinearGradient
					// Out to nothing at the tip, as the web's: an 8% tip still read as a cap
					colors={
						[...FADE_STOPS.map((a) => tint(color, a)), color] as [string, string]
					}
					locations={[...FADE_LOCATIONS.map((l) => l * (1 - solidTo)), 1] as [number, number]}
					style={styles.barFill}
				/>
			</View>
		);
	}
	// A short bar's pool sinks below the axis rather than shrinking: it still spreads sideways to
	// meet its neighbours', but no longer climbs past the bar's fade
	const poolDrop = Math.max(0, POOL_REACH - height * GLOW_MAX_RISE);
	const shrink = Math.min(1, height / FULL_GLOW_HEIGHT);
	return (
		<>
			<View
				style={[
					styles.bar,
					{
						height: POOL.height,
						width: GLOW_CORE,
						borderRadius: GLOW_CORE / 2,
						backgroundColor: tint(color, POOL.alpha * CORE_FILL),
						boxShadow: `0 ${poolDrop}px ${POOL.blur}px ${POOL.spread}px ${tint(color, POOL.alpha)}`,
					},
				]}
			/>
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
								boxShadow: `0 0 ${layer.blur * shrink}px ${layer.spread * shrink + CORE_SPREAD}px ${tint(color, layer.alpha)}`,
							},
						]}
					/>
				),
			)}
		</>
	);
}

export default function WeeklyChart({
	data,
	title = "Daily Watch Rate",
	emptyMessage,
	animate = false,
}: Readonly<Props>) {
	const maxEp = Math.max(0, ...data.map((d) => d.episodes));
	const maxMov = Math.max(0, ...data.map((d) => d.movies));
	const maxVal = Math.max(1, maxEp, maxMov);
	// Room above the chart for whichever day's count labels reach highest: a day with two labels
	// can stand taller than the peak day with one. No dead space under the title otherwise
	const labelRoom = Math.max(
		0,
		...data.map((d) => {
			const labels = Number(d.episodes > 0) + Number(d.movies > 0);
			if (!labels) return 0;
			const top = barHeight(Math.max(d.episodes, d.movies), maxVal);
			return top + LABEL_GAP + labels * LABEL_LINE - CHART_HEIGHT;
		}),
	);
	const hasData = data.some((d) => d.episodes > 0 || d.movies > 0);
	const grow = useGrow(data.length, animate);

	return (
		<View style={styles.container}>
			<Text style={styles.title}>{title}</Text>
			<View style={[styles.chartRow, { paddingTop: labelRoom }]}>
				{!hasData && emptyMessage && (
					<View style={styles.emptyArea} pointerEvents="none">
						<Text style={styles.emptyText}>{emptyMessage}</Text>
					</View>
				)}
				{data.map((day, i) => {
					const epH = barHeight(day.episodes, maxVal);
					const movH = barHeight(day.movies, maxVal);
					const total = day.episodes + day.movies;

					// Taller one behind, shorter in front
					const epBehind = epH >= movH;
					// Counts above the bars in their bar's neon colour, stacked a line apart with the
					// higher value on top
					const labels = [
						{ kind: "ep", value: day.episodes, color: colors.primary },
						{ kind: "mov", value: day.movies, color: colors.moviePurple },
					]
						.filter((l) => l.value > 0)
						.sort((a, b) => a.value - b.value);

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
										{/* Both glows, then both bars: taller behind, shorter in front */}
										{(["glow", "fill"] as const).map((part) => (
											<React.Fragment key={part}>
												<GlowBar
													part={part}
													color={epBehind ? colors.primary : colors.moviePurple}
													height={epBehind ? epH : movH}
													solidTo={Math.min(epH, movH) / Math.max(epH, movH, 1)}
												/>
												<GlowBar
													part={part}
													color={epBehind ? colors.moviePurple : colors.primary}
													height={epBehind ? movH : epH}
													solidTo={frontSolid(Math.min(epH, movH), Math.max(epH, movH))}
												/>
											</React.Fragment>
										))}
										{total === 0 && <View style={styles.emptyNub} />}
									</View>
								</Animated.View>
								<Animated.View
									style={[StyleSheet.absoluteFill, { opacity: grow[i] }]}
									pointerEvents="none"
								>
									{labels.map((l, n) => (
										<NeonCount
											key={l.kind}
											value={l.value}
											color={l.color}
											// Stacked above the taller bar, one line apart
											bottom={GLOW_HEIGHT + Math.max(epH, movH) + LABEL_GAP + n * LABEL_LINE}
										/>
									))}
								</Animated.View>
							</View>
							<Text style={styles.dayLabel}>{day.label}</Text>
						</View>
					);
				})}
			</View>
			{/* No legend of its own: the Weekly Watch Rate rows above name both colours */}
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
	// Same gap under the title as Weekly Watch Rate's (its section gap)
	title: {
		...typography.subtitle,
		marginBottom: spacing.sm,
	},
	// paddingTop is set inline: just the tallest bar's count labels
	chartRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-end",
	},
	// Over the bars' area only, above the baseline nubs and day labels
	emptyArea: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		height: CHART_HEIGHT,
		alignItems: "center",
		justifyContent: "center",
	},
	emptyText: {
		...typography.caption,
		textAlign: "center",
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
		// The bloom spills into the gap under the baseline, and on under the day labels
		paddingBottom: GLOW_HEIGHT + GLOW_BELOW,
		marginBottom: -GLOW_BELOW,
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
	dayLabel: {
		...typography.caption,
		fontSize: 10,
		marginTop: spacing.xs,
	},
	countLabel: {
		...typography.caption,
		fontSize: 11,
		lineHeight: LABEL_LINE,
		fontWeight: "700",
		textAlign: "center",
		textShadowOffset: { width: 0, height: 0 },
	},
});
