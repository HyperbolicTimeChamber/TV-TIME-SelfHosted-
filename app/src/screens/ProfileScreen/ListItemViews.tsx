import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useReorderableDrag } from "react-native-reorderable-list";
import { MediaType, type CustomListItem } from "../../types";
import { useShowDetails, useTitleInfo } from "../../hooks";
import PosterImage from "../../components/PosterImage";
import ShowDrawer, { type ShowDrawerAction, type ShowDrawerData } from "../../components/ShowDrawer";
import { colors, spacing, typography } from "../../theme";
import { listItemMeta } from "../../utils";

const ROW_POSTER_W = 56;
const ROW_POSTER_H = 84;

/** TV / MOVIE pill — the one on Search's cards */
function TypeBadge({ mediaType }: Readonly<{ mediaType: MediaType }>) {
	return (
		<View style={[styles.typeBadge, mediaType === MediaType.MOVIE && styles.typeBadgeMovie]}>
			<Text style={styles.typeBadgeText}>{mediaType === MediaType.TV ? "TV" : "MOVIE"}</Text>
		</View>
	);
}

interface RowProps {
	item: CustomListItem;
	onPress: () => void;
	onLongPress: () => void;
}

/** List view: poster, name, TV / MOVIE pill and — a show: episodes + episode length, a movie: runtime */
export function ListRow({ item, onPress, onLongPress }: Readonly<RowProps>) {
	const { data: info } = useTitleInfo(item.tmdbId, item.mediaType);
	const meta = info ? listItemMeta(item.mediaType, info) : "";
	return (
		<TouchableOpacity
			style={styles.row}
			onPress={onPress}
			onLongPress={onLongPress}
			delayLongPress={350}
			activeOpacity={0.7}
		>
			<PosterImage
				posterPath={item.posterPath}
				mediaType={item.mediaType}
				style={styles.rowPoster}
				title={!item.posterPath ? item.title : undefined}
			/>
			<View style={styles.rowText}>
				<Text style={styles.rowTitle} numberOfLines={2}>
					{item.title}
				</Text>
				<View style={styles.rowMetaLine}>
					<TypeBadge mediaType={item.mediaType} />
					{meta ? (
						<Text style={styles.rowMeta} numberOfLines={1}>
							{meta}
						</Text>
					) : null}
				</View>
			</View>
		</TouchableOpacity>
	);
}

/** Reorder mode: a compact row; press and hold anywhere on it to pick it up, drag, drop */
export function ReorderRow({ item }: Readonly<{ item: CustomListItem }>) {
	const drag = useReorderableDrag();
	return (
		<TouchableOpacity style={styles.reorderRow} onLongPress={drag} delayLongPress={250} activeOpacity={0.8}>
			<PosterImage
				posterPath={item.posterPath}
				mediaType={item.mediaType}
				style={styles.reorderPoster}
				title={!item.posterPath ? item.title : undefined}
			/>
			<Text style={[styles.rowTitle, styles.reorderTitle]} numberOfLines={2}>
				{item.title}
			</Text>
			<TypeBadge mediaType={item.mediaType} />
			<Ionicons name="reorder-three" size={24} color={colors.textMuted} />
		</TouchableOpacity>
	);
}

interface PreviewProps {
	item: CustomListItem | null;
	actions: ShowDrawerAction[];
	onGoToShow: (item: CustomListItem) => void;
	onClose: () => void;
}

/** The watchlist's preview card for a list item (poster / backdrop, facts, synopsis) plus the list actions */
export function ListItemPreview({ item, actions, onGoToShow, onClose }: Readonly<PreviewProps>) {
	// Only the one opened title is looked up (catalog / TMDB); cached for the details page too
	const { data: show } = useShowDetails(item?.tmdbId ?? 0, item?.mediaType ?? MediaType.TV);
	const genreNames = ((show as { genres?: Array<{ name?: string }> } | undefined)?.genres ?? [])
		.map((g) => g.name)
		.filter(Boolean)
		.join(", ");
	const data: ShowDrawerData | null = item
		? {
				tmdbId: item.tmdbId,
				mediaType: item.mediaType,
				title: item.title,
				posterPath: show?.poster_path ?? item.posterPath,
				backdropPath: show?.backdrop_path ?? null,
				// null → skeleton lines while the details load
				overview: show ? show.overview || "" : null,
				year: (show?.first_air_date || show?.release_date || "").substring(0, 4) || null,
				totalSeasons: show?.number_of_seasons ?? null,
				totalEpisodes: show?.number_of_episodes ?? null,
				runtime:
					show?.runtime ?? (show as { episode_run_time?: number[] } | undefined)?.episode_run_time?.[0] ?? null,
				genres: show ? genreNames || "" : null,
				voteAverage: show?.vote_average ?? null,
			}
		: null;
	return (
		<ShowDrawer
			visible={!!item}
			show={data}
			actions={actions}
			onGoToShow={item ? () => onGoToShow(item) : undefined}
			onClose={onClose}
		/>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingVertical: spacing.sm,
	},
	rowPoster: { width: ROW_POSTER_W, height: ROW_POSTER_H, borderRadius: 6 },
	rowText: { flex: 1, gap: spacing.xs },
	rowTitle: { ...typography.subtitle, fontSize: 15 },
	rowMetaLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
	rowMeta: { ...typography.caption, flexShrink: 1 },
	typeBadge: {
		backgroundColor: colors.primary,
		borderRadius: 4,
		paddingHorizontal: 6,
		paddingVertical: 2,
	},
	typeBadgeMovie: { backgroundColor: colors.moviePurple },
	typeBadgeText: { color: colors.text, fontSize: 10, fontWeight: "700" },
	reorderRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingVertical: spacing.sm,
		paddingHorizontal: spacing.md,
		marginBottom: spacing.sm,
		backgroundColor: colors.surface,
		borderRadius: 10,
	},
	reorderPoster: { width: 40, height: 60, borderRadius: 4 },
	reorderTitle: { flex: 1 },
});
