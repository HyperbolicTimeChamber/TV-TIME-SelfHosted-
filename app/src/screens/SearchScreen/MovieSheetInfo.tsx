import { Text, View, StyleSheet } from "react-native";
import SkeletonLine from "../../components/SkeletonLine";
import { useMovieSheetDetails } from "../../hooks/useMovieSheetDetails";
import { directorLabel, movieSheetMeta } from "../../utils";
import { colors, spacing, typography, themedStyles } from "../../theme";

interface Props {
	tmdbId: number;
	/** From the search item — shown at once ("2010") */
	year: string | null;
}

/**
 * Under the add sheet's title: year (known at once) · runtime, the director, the overview.
 * Director / overview show a SkeletonLine while the details load, nothing when loaded and empty
 */
export default function MovieSheetInfo({ tmdbId, year }: Readonly<Props>) {
	const { data, isPending } = useMovieSheetDetails(tmdbId);
	const meta = movieSheetMeta(year, data?.runtime ?? null);
	const directors = data?.directors ?? [];
	const overview = data?.overview ?? "";
	return (
		<View style={styles.wrap}>
			{meta ? <Text style={styles.meta}>{meta}</Text> : null}
			{isPending ? (
				<View style={styles.skeletons} accessibilityLabel="Loading details">
					<SkeletonLine width="55%" height={14} />
					<SkeletonLine width="100%" height={12} />
					<SkeletonLine width="80%" height={12} />
				</View>
			) : (
				<>
					{directors.length > 0 ? (
						<Text style={styles.director} numberOfLines={2}>
							<Text style={styles.label}>{directorLabel(directors.length)} </Text>
							{directors.join(", ")}
						</Text>
					) : null}
					{overview ? (
						<Text style={styles.overview} numberOfLines={3}>
							{overview}
						</Text>
					) : null}
				</>
			)}
		</View>
	);
}

const styles = themedStyles(() =>
	StyleSheet.create({
		wrap: { gap: spacing.sm, paddingHorizontal: spacing.sm, marginBottom: spacing.md },
		meta: { ...typography.caption, color: colors.textSecondary, textAlign: "center" },
		skeletons: { gap: spacing.sm },
		director: { ...typography.body, color: colors.textSecondary },
		label: { ...typography.subtitle, fontSize: 14, color: colors.primary },
		overview: { ...typography.body, color: colors.textSecondary },
	}),
);
