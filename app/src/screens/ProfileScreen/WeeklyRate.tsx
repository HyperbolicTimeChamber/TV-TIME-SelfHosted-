import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../theme";

const GROW_MS = 500;
const GROW_STAGGER_MS = 80;
const BAR_HEIGHT = 14;

interface Props {
	episodes: number;
	movies: number;
	/** Fill the bars from the left (the Profile screen's first appearance after launch) */
	animate?: boolean;
}

/** One bar per kind, both measured against whichever had the bigger week */
function Bar({
	label,
	value,
	share,
	color,
	grow,
}: {
	label: string;
	value: number;
	/** 0–1 of the row's width */
	share: number;
	color: string;
	grow: Animated.Value;
}) {
	return (
		<View style={styles.row}>
			<View style={styles.rowHeader}>
				<View style={styles.rowLabel}>
					<View style={[styles.swatch, { backgroundColor: color }]} />
					<Text style={styles.label}>{label}</Text>
				</View>
				<Text style={styles.value}>{value}</Text>
			</View>
			<View style={styles.track}>
				<Animated.View
					style={[
						styles.fill,
						{
							backgroundColor: color,
							transform: [{ scaleX: grow }],
							width: `${Math.max(share, value > 0 ? 0.02 : 0) * 100}%`,
						},
					]}
				/>
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
				label="Episodes"
				value={episodes}
				share={episodes / peak}
				color={colors.primary}
				grow={bars.current[0]}
			/>
			<Bar
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
	container: {
		marginHorizontal: spacing.lg,
		marginTop: spacing.xl,
	},
	title: {
		...typography.subtitle,
		marginBottom: spacing.md,
	},
	row: {
		marginBottom: spacing.md,
	},
	rowHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: spacing.xs,
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
	track: {
		height: BAR_HEIGHT,
		borderRadius: BAR_HEIGHT / 2,
		backgroundColor: colors.surface,
		overflow: "hidden",
	},
	// Grown with scaleX from the left edge, so the fill runs out rather than fading in
	fill: {
		height: BAR_HEIGHT,
		borderRadius: BAR_HEIGHT / 2,
		transformOrigin: "left",
	},
});
