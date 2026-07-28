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

const CHART_HEIGHT = 100;
const BAR_WIDTH = 20;
const GAP = 4;

export default function WeeklyChart({ data }: Readonly<Props>) {
	const maxVal = Math.max(1, ...data.map((d) => d.episodes + d.movies));

	return (
		<View style={styles.container}>
			<Text style={styles.title}>This Week</Text>
			<View style={styles.chartRow}>
				{data.map((day) => {
					const total = day.episodes + day.movies;
					const totalH = (total / maxVal) * CHART_HEIGHT;
					const movieH = (day.movies / maxVal) * CHART_HEIGHT;
					const epH = totalH - movieH;

					return (
						<View key={day.label} style={styles.barGroup}>
							<View style={styles.barContainer}>
								<Svg width={BAR_WIDTH} height={CHART_HEIGHT}>
									{epH > 0 && (
										<Rect
											x={0}
											y={CHART_HEIGHT - totalH}
											width={BAR_WIDTH}
											height={epH}
											rx={4}
											fill={colors.primary}
										/>
									)}
									{movieH > 0 && (
										<Rect
											x={0}
											y={CHART_HEIGHT - movieH}
											width={BAR_WIDTH}
											height={movieH}
											rx={4}
											fill={colors.moviePurple}
										/>
									)}
									{total === 0 && (
										<Rect
											x={0}
											y={CHART_HEIGHT - 3}
											width={BAR_WIDTH}
											height={3}
											rx={1.5}
											fill={colors.surfaceLight}
										/>
									)}
								</Svg>
							</View>
							<Text style={styles.dayLabel}>{day.label}</Text>
							{total > 0 && <Text style={styles.countLabel}>{total}</Text>}
						</View>
					);
				})}
			</View>
			<View style={styles.legend}>
				<View style={styles.legendItem}>
					<View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
					<Text style={styles.legendText}>Episodes</Text>
				</View>
				<View style={styles.legendItem}>
					<View style={[styles.legendDot, { backgroundColor: colors.moviePurple }]} />
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
	barContainer: {
		height: CHART_HEIGHT,
		justifyContent: "flex-end",
	},
	dayLabel: {
		...typography.caption,
		fontSize: 10,
		marginTop: spacing.xs,
	},
	countLabel: {
		...typography.caption,
		fontSize: 10,
		color: colors.text,
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
	legendDot: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	legendText: {
		...typography.caption,
		fontSize: 10,
	},
});
