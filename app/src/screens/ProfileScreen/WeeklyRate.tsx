import { useEffect, useRef, useState } from "react";
import {
	AccessibilityInfo,
	Animated,
	Easing,
	LayoutChangeEvent,
	StyleSheet,
	Text,
	View,
} from "react-native";
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { colors, spacing, typography } from "../../theme";

const GROW_MS = 500;
const GROW_STAGGER_MS = 80;
/** Glow and all, a row is as tall as the plain bar it replaced; the core is a third of that,
 *  since the outer halo reaches BAR_H either side of it */
const GLOW_H = 14;
const BAR_H = GLOW_H / 3;
const CY = GLOW_H / 2;
/** Mirrors the ellipse the chart puts under each bar */
const BASE_GLOW = 20;

interface Props {
	episodes: number;
	movies: number;
	/** Fill the bars from the left (the Profile screen's first appearance after launch) */
	animate?: boolean;
}

/** WeeklyChart's GlowBar laid on its side: the bar runs right from the axis instead of up */
function GlowBar({ id, color, length }: Readonly<{ id: string; color: string; length: number }>) {
	if (length <= 0) {
		return (
			<>
				<Rect x={0} y={CY - BAR_H / 2} width={4} height={BAR_H} rx={2} fill={colors.surfaceLight} />
				<Ellipse
					cx={2}
					cy={CY}
					rx={BASE_GLOW * 0.3}
					ry={CY}
					fill={colors.surfaceLight}
					opacity={0.1}
				/>
			</>
		);
	}
	return (
		<>
			{/* Outer glow — wide, soft */}
			<Rect
				x={0}
				y={CY - BAR_H * 1.5}
				width={length * 0.8}
				height={BAR_H * 3}
				rx={BAR_H * 1.5}
				fill={color}
				opacity={0.12}
			/>
			{/* Mid glow */}
			<Rect
				x={0}
				y={CY - BAR_H}
				width={length * 0.9}
				height={BAR_H * 2}
				rx={BAR_H}
				fill={color}
				opacity={0.2}
			/>
			{/* Core bar — bright at the axis, fading at the tip */}
			<Rect
				x={0}
				y={CY - BAR_H / 2}
				width={length}
				height={BAR_H}
				rx={BAR_H / 2}
				fill={`url(#${id})`}
			/>
			{/* Base glow where the bar leaves the axis */}
			<Ellipse cx={0} cy={CY} rx={BASE_GLOW * 0.55} ry={CY} fill={`url(#${id}_radial)`} />
		</>
	);
}

function Bar({
	label,
	value,
	share,
	color,
	id,
	grow,
}: Readonly<{
	label: string;
	value: number;
	/** 0–1 of the row's width */
	share: number;
	color: string;
	id: string;
	grow: Animated.Value;
}>) {
	const [width, setWidth] = useState(0);
	const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

	return (
		<View style={styles.row}>
			<View style={styles.rowHeader}>
				<View style={styles.rowLabel}>
					<View style={[styles.swatch, { backgroundColor: color }]} />
					<Text style={styles.label}>{label}</Text>
				</View>
				<Text style={styles.value}>{value}</Text>
			</View>
			<View style={styles.track} onLayout={onLayout}>
				{width > 0 && (
					<Animated.View style={{ transformOrigin: "left", transform: [{ scaleX: grow }] }}>
						<Svg width={width} height={GLOW_H}>
							<Defs>
								<LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
									<Stop offset="0" stopColor={color} stopOpacity="1" />
									<Stop offset="0.2" stopColor={color} stopOpacity="0.95" />
									<Stop offset="0.6" stopColor={color} stopOpacity="0.6" />
									<Stop offset="1" stopColor={color} stopOpacity="0.15" />
								</LinearGradient>
								<RadialGradient id={`${id}_radial`} cx="50%" cy="50%" rx="50%" ry="50%">
									<Stop offset="0" stopColor={color} stopOpacity="0.5" />
									<Stop offset="1" stopColor={color} stopOpacity="0" />
								</RadialGradient>
							</Defs>
							<GlowBar id={id} color={color} length={width * share} />
						</Svg>
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

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Weekly Watch Rate</Text>
			<Bar
				id="weekEp"
				label="Episodes"
				value={episodes}
				share={episodes / peak}
				color={colors.primary}
				grow={bars.current[0]}
			/>
			<Bar
				id="weekMov"
				label="Movies"
				value={movies}
				share={movies / peak}
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
	row: {},
	rowHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
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
		height: GLOW_H,
		justifyContent: "center",
	},
});
