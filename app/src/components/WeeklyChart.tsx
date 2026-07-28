import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { colors, spacing, typography } from "../theme";

interface DayData {
	label: string;
	episodes: number;
	movies: number;
}

interface Props {
	data: DayData[];
}

const CHART_HEIGHT = 120;
const BAR_WIDTH = 16;
const BAR_GAP = 3;
const PAIR_WIDTH = BAR_WIDTH * 2 + BAR_GAP;

export default function WeeklyChart({ data }: Readonly<Props>) {
	const maxEp = Math.max(0, ...data.map((d) => d.episodes));
	const maxMov = Math.max(0, ...data.map((d) => d.movies));
	const maxVal = Math.max(1, maxEp, maxMov);

	return (
		<View style={styles.container}>
			<Text style={styles.title}>This Week</Text>
			<View style={styles.chartRow}>
				{data.map((day) => {
					const epH = (day.episodes / maxVal) * CHART_HEIGHT;
					const movH = (day.movies / maxVal) * CHART_HEIGHT;

					return (
						<View key={day.label} style={styles.barGroup}>
							<View style={styles.barPair}>
								<Svg width={PAIR_WIDTH} height={CHART_HEIGHT}>
									{/* Episodes bar (solid) */}
									{epH > 0 ? (
										<Rect
											x={0}
											y={CHART_HEIGHT - epH}
											width={BAR_WIDTH}
											height={epH}
											rx={4}
											fill={colors.primary}
										/>
									) : (
										<Rect
											x={0}
											y={CHART_HEIGHT - 3}
											width={BAR_WIDTH}
											height={3}
											rx={1.5}
											fill={colors.surfaceLight}
										/>
									)}

									{/* Movies bar (solid) */}
									{movH > 0 ? (
										<Rect
											x={BAR_WIDTH + BAR_GAP}
											y={CHART_HEIGHT - movH}
											width={BAR_WIDTH}
											height={movH}
											rx={4}
											fill={colors.moviePurple}
										/>
									) : (
										<Rect
											x={BAR_WIDTH + BAR_GAP}
											y={CHART_HEIGHT - 3}
											width={BAR_WIDTH}
											height={3}
											rx={1.5}
											fill={colors.surfaceLight}
										/>
									)}
								</Svg>

								{/* Count labels above bars */}
								{day.episodes > 0 && (
									<Text
										style={[
											styles.countLabel,
											{
												position: "absolute",
												bottom: epH + 2,
												left: 0,
												width: BAR_WIDTH,
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
												bottom: movH + 2,
												left: BAR_WIDTH + BAR_GAP,
												width: BAR_WIDTH,
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
					<View
						style={[styles.legendSwatch, { backgroundColor: colors.moviePurple }]}
					/>
					<Text style={styles.legendText}>Movies</Text>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		backgroundColor: colors.surface,
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
		height: CHART_HEIGHT,
		width: PAIR_WIDTH,
		justifyContent: "flex-end",
	},
	dayLabel: {
		...typography.caption,
		fontSize: 10,
		marginTop: spacing.xs,
	},
	countLabel: {
		...typography.caption,
		fontSize: 9,
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
		borderRadius: 2,
	},
	legendText: {
		...typography.caption,
		fontSize: 10,
	},
});
