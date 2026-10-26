import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, tint, typography } from "../../theme";

const GROW_MS = 500;
const GROW_STAGGER_MS = 80;
/** Core thickness; the shadow blooms outside it without taking layout space, so a row stays
 *  about as tall as the plain bar it replaced */
const BAR_H = 6;
const ROW_H = 14;
/** Room round the bar for its glow: a GPU-cached view is clipped to its own bounds */
const GLOW_PAD = 24;

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
		blur: BAR_H * (2.2 - 0.8 * t),
		spread: BAR_H * 0.8 * t,
	};
});
/** An outset shadow is cut out of its own box, so a bar-thick layer leaves a hole in the glow
 *  that shows through the bar's faded tip. A hairline core tucked under the bar, with the
 *  difference added to the spread, with the core itself filled in, keeps the same shape without the hole. */
const GLOW_CORE = 2;
/** The blur thins a shadow at its source, so a core filled at full strength reads as a bright seam */
const CORE_FILL = 0.55;
const CORE_SPREAD = (BAR_H - GLOW_CORE) / 2;

interface Props {
	episodes: number;
	movies: number;
	/** Fill the bars from the left (the Profile screen's first appearance after launch) */
	animate?: boolean;
}

function Bar({
	label,
	value,
	share,
	color,
	grow,
}: Readonly<{
	label: string;
	value: number;
	/** 0–1 of the row's width */
	share: number;
	color: string;
	grow: Animated.Value;
}>) {
	const empty = value <= 0;
	return (
		<View>
			<View style={styles.rowHeader}>
				<View style={styles.rowLabel}>
					<View style={[styles.swatch, { backgroundColor: color }]} />
					<Text style={styles.label}>{label}</Text>
				</View>
				<Text style={styles.value}>{value}</Text>
			</View>
			<View style={styles.track}>
				{empty ? (
					<View style={styles.stub} />
				) : (
					<Animated.View
						style={[
							styles.glowCanvas,
							{
								// The bar's left end, inside the canvas's padding
								transformOrigin: `${GLOW_PAD}px 50%`,
								transform: [{ scaleX: grow }],
							},
						]}
						// The stacked glow shadows are costly to draw: paint them once into a GPU
						// texture, so growing the bar only stretches that
						renderToHardwareTextureAndroid
						shouldRasterizeIOS
					>
						<View style={[styles.barStack, { width: `${Math.max(share, 0.02) * 100}%` }]}>
							{GLOW_LAYERS.map((layer) => (
								<View
									key={layer.frac}
									style={[
										styles.bar,
										{
											left: CORE_SPREAD,
											width: `${layer.frac * 100}%`,
											height: GLOW_CORE,
											borderRadius: GLOW_CORE / 2,
											// Fills the core's own cut-out to match the blurred shadow around it
											backgroundColor: tint(color, layer.alpha * CORE_FILL),
											// Spread, not a thicker box, so the glow thickens toward the axis while the bar stays slim
											boxShadow: `0 0 ${layer.blur}px ${layer.spread + CORE_SPREAD}px ${tint(color, layer.alpha)}`,
										},
									]}
								/>
							))}
							{/* Bright where the bar leaves the axis, fading at the tip, as the chart's do */}
							<View style={[styles.bar, { width: "100%" }]}>
								<LinearGradient
									colors={[color, tint(color, 0.7), tint(color, 0.3), tint(color, 0.08)]}
									locations={[0, 0.3, 0.65, 1]}
									start={{ x: 0, y: 0 }}
									end={{ x: 1, y: 0 }}
									style={styles.fill}
								/>
							</View>
						</View>
					</Animated.View>
				)}
			</View>
		</View>
	);
}

/** This week's totals as two bars — the same numbers the daily chart adds up */
export default function WeeklyRate({ episodes, movies, animate = false }: Readonly<Props>) {
	const bars = useRef([new Animated.Value(animate ? 0 : 1), new Animated.Value(animate ? 0 : 1)]);

	useEffect(() => {
		if (!animate) return;
		const values = bars.current;
		// `animate` turns on at first focus, which is after mount — this screen is preloaded
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
	}, [animate]);

	const peak = Math.max(episodes, movies, 1);
	// Widths on a square-root scale, like the daily chart: 3 movies next to 56 episodes still
	// reads as a bar, not a dot. Exact counts sit beside them

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Weekly Watch Rate</Text>
			<Bar
				label="Episodes"
				value={episodes}
				share={Math.sqrt(episodes / peak)}
				color={colors.primary}
				grow={bars.current[0]}
			/>
			<Bar
				label="Movies"
				value={movies}
				share={Math.sqrt(movies / peak)}
				color={colors.moviePurple}
				grow={bars.current[1]}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	// Same inset as WeeklyChart below it, which pads inside its own horizontal margin
	container: {
		marginHorizontal: spacing.lg,
		paddingHorizontal: spacing.lg,
		marginTop: spacing.xl,
		gap: spacing.sm,
	},
	title: {
		...typography.subtitle,
	},
	rowHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		// A little clear of the bar's glow below
		paddingBottom: 2,
	},
	rowLabel: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
	},
	swatch: {
		width: 10,
		height: 10,
		borderRadius: 5,
	},
	label: {
		...typography.caption,
		fontSize: 12,
		color: colors.textSecondary,
	},
	value: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.text,
	},
	// No plate behind it: the bars sit on the page as the chart's do, glow and all
	track: {
		height: ROW_H,
		justifyContent: "center",
	},
	// The bar's GPU-cached layer, big enough for its glow: the padding holds the glow, the
	// matching negative margins keep the layout as if it were just the bar
	glowCanvas: {
		margin: -GLOW_PAD,
		padding: GLOW_PAD,
	},
	barStack: {
		height: BAR_H,
		justifyContent: "center",
	},
	bar: {
		position: "absolute",
		left: 0,
		height: BAR_H,
		borderRadius: BAR_H / 2,
		overflow: "hidden",
	},
	fill: {
		flex: 1,
	},
	// Nothing watched: the same nub the chart shows for an empty day
	stub: {
		width: 4,
		height: BAR_H,
		borderRadius: 2,
		backgroundColor: colors.surfaceLight,
	},
});
