import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Ellipse } from "react-native-svg";
import { colors, spacing, typography } from "../theme";

interface DayData {
	label: string;
	episodes: number;
	movies: number;
}

interface Props {
	data: DayData[];
}

const CHART_HEIGHT = 130;
const GLOW_HEIGHT = 24;
const TOTAL_HEIGHT = CHART_HEIGHT + GLOW_HEIGHT;
const BAR_WIDTH = 10;
const SVG_W = BAR_WIDTH + 30;
const CX = SVG_W / 2;

function GlowBar({
	id,
	color,
	height,
	chartH,
}: Readonly<{
	id: string;
	color: string;
	height: number;
	chartH: number;
}>) {
	if (height <= 0) return null;
	const y = chartH - height;
	return (
		<>
			{/* Outer glow — wide, soft */}
			<Rect
				x={CX - BAR_WIDTH * 1.5}
				y={y + height * 0.2}
				width={BAR_WIDTH * 3}
				height={height * 0.8}
				rx={BAR_WIDTH * 1.5}
				fill={color}
				opacity={0.12}
			/>
			{/* Mid glow */}
			<Rect
				x={CX - BAR_WIDTH}
				y={y + height * 0.1}
				width={BAR_WIDTH * 2}
				height={height * 0.9}
				rx={BAR_WIDTH}
				fill={color}
				opacity={0.2}
			/>
			{/* Core bar with gradient — bright bottom, fade top */}
			<Rect
				x={CX - BAR_WIDTH / 2}
				y={y}
				width={BAR_WIDTH}
				height={height}
				rx={BAR_WIDTH / 2}
				fill={`url(#${id})`}
			/>
			{/* Base glow — ellipse reflection */}
			<Ellipse
				cx={CX}
				cy={chartH + 2}
				rx={BAR_WIDTH * 1.8}
				ry={GLOW_HEIGHT * 0.55}
				fill={`url(#${id}_radial)`}
			/>
		</>
	);
}

export default function WeeklyChart({ data }: Readonly<Props>) {
	const maxEp = Math.max(0, ...data.map((d) => d.episodes));
	const maxMov = Math.max(0, ...data.map((d) => d.movies));
	const maxVal = Math.max(1, maxEp, maxMov);
	const hasData = data.some((d) => d.episodes > 0 || d.movies > 0);

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Watch Statistics</Text>
			{!hasData && (
				<Text style={styles.emptyText}>Your Weekly Watch Data will appear here Shortly</Text>
			)}
			<View style={styles.chartRow}>
				{data.map((day) => {
					const epH = (day.episodes / maxVal) * CHART_HEIGHT;
					const movH = (day.movies / maxVal) * CHART_HEIGHT;
					const total = day.episodes + day.movies;

					// Taller one behind, shorter in front
					const epBehind = epH >= movH;

					return (
						<View key={day.label} style={styles.barGroup}>
							<View style={styles.barPair}>
								<Svg width={SVG_W} height={TOTAL_HEIGHT}>
									<Defs>
										<LinearGradient id={`ep_${day.label}`} x1="0" y1="0" x2="0" y2="1">
											<Stop offset="0" stopColor={colors.primary} stopOpacity="0.15" />
											<Stop offset="0.4" stopColor={colors.primary} stopOpacity="0.6" />
											<Stop offset="0.8" stopColor={colors.primary} stopOpacity="0.95" />
											<Stop offset="1" stopColor={colors.primary} stopOpacity="1" />
										</LinearGradient>
										<RadialGradient
											id={`ep_${day.label}_radial`}
											cx="50%"
											cy="30%"
											rx="50%"
											ry="50%"
										>
											<Stop offset="0" stopColor={colors.primary} stopOpacity="0.5" />
											<Stop offset="1" stopColor={colors.primary} stopOpacity="0" />
										</RadialGradient>
										<LinearGradient id={`mov_${day.label}`} x1="0" y1="0" x2="0" y2="1">
											<Stop offset="0" stopColor={colors.moviePurple} stopOpacity="0.15" />
											<Stop offset="0.4" stopColor={colors.moviePurple} stopOpacity="0.6" />
											<Stop offset="0.8" stopColor={colors.moviePurple} stopOpacity="0.95" />
											<Stop offset="1" stopColor={colors.moviePurple} stopOpacity="1" />
										</LinearGradient>
										<RadialGradient
											id={`mov_${day.label}_radial`}
											cx="50%"
											cy="30%"
											rx="50%"
											ry="50%"
										>
											<Stop offset="0" stopColor={colors.moviePurple} stopOpacity="0.5" />
											<Stop offset="1" stopColor={colors.moviePurple} stopOpacity="0" />
										</RadialGradient>
									</Defs>

									{/* Back bar */}
									{epBehind ? (
										<GlowBar
											id={`ep_${day.label}`}
											color={colors.primary}
											height={epH}
											chartH={CHART_HEIGHT}
										/>
									) : (
										<GlowBar
											id={`mov_${day.label}`}
											color={colors.moviePurple}
											height={movH}
											chartH={CHART_HEIGHT}
										/>
									)}

									{/* Front bar */}
									{epBehind ? (
										<GlowBar
											id={`mov_${day.label}`}
											color={colors.moviePurple}
											height={movH}
											chartH={CHART_HEIGHT}
										/>
									) : (
										<GlowBar
											id={`ep_${day.label}`}
											color={colors.primary}
											height={epH}
											chartH={CHART_HEIGHT}
										/>
									)}

									{total === 0 && (
										<>
											<Rect
												x={CX - BAR_WIDTH / 2}
												y={CHART_HEIGHT - 4}
												width={BAR_WIDTH}
												height={4}
												rx={2}
												fill={colors.surfaceLight}
											/>
											<Ellipse
												cx={CX}
												cy={CHART_HEIGHT + 2}
												rx={BAR_WIDTH}
												ry={GLOW_HEIGHT * 0.3}
												fill={colors.surfaceLight}
												opacity={0.1}
											/>
										</>
									)}
								</Svg>
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
		marginTop: spacing.lg,
	},
	title: {
		...typography.subtitle,
		marginBottom: spacing.md,
	},
	chartRow: {
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
