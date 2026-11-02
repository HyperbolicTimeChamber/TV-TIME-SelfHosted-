import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useReorderableDrag } from "react-native-reorderable-list";
import { MediaType, type CustomListItem } from "../../types";
import { useShowDetails, useTitleInfo } from "../../hooks";
import { useTitleLogo } from "../../hooks/useTitleLogo";
import { tmdbBlurredBackdropUri, tmdbLogoUri, tmdbPosterUri } from "../../hooks/useTmdbImage";
import { BLUR_RADIUS } from "./styles";
import { CARD_WIDTH, listStyles as card } from "../CalendarScreen/listStyles";
import PosterImage from "../../components/PosterImage";
import SkeletonLine from "../../components/SkeletonLine";
import ShowDrawer, {
	type ShowDrawerAction,
	type ShowDrawerData,
} from "../../components/ShowDrawer";
import { colors, spacing, typography } from "../../theme";
import { formatRuntime } from "../../utils";

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

/** Wait this long for a logo before showing the name — the name flashing in, then swapping for
 *  the logo, read as a glitch (as in the sheets) */
const NAME_DELAY_MS = 2000;
/** Backdrop / logo fade in instead of popping */
const IMAGE_FADE_MS = 200;
/** A poster standing in for a missing backdrop: blurred to a wash of its colours */
const POSTER_BLUR_RADIUS = 30;
/** Taller than any card — the loading shimmer fills the whole card behind the overlay */
const CARD_FILL = 400;

/**
 * List view: a calendar card (the Watch History family) for a saved title — blurred backdrop, logo
 * (name when there's none) over its TV / MOVIE pill and runtime, and the calendar's square holding
 * a show's episode count / a movie's year.
 */
export function ListRow({ item, onPress, onLongPress }: Readonly<RowProps>) {
	const { data: info, isPending: infoLoading } = useTitleInfo(item.tmdbId, item.mediaType);
	const logoPath = useTitleLogo(undefined, item.tmdbId, item.mediaType);
	const [waited, setWaited] = useState(false);
	useEffect(() => {
		const t = setTimeout(() => setWaited(true), NAME_DELAY_MS);
		return () => clearTimeout(t);
	}, []);
	const isMovie = item.mediaType === MediaType.MOVIE;
	const runtime = formatRuntime(info?.runtime);
	const square = isMovie
		? { label: "YEAR", value: info?.year ?? null }
		: { label: "EPISODES", value: info?.totalEpisodes ? String(info.totalEpisodes) : null };
	// No logo on TMDB → the name at once; still looking → after the wait
	const showName = logoPath === null || (!logoPath && waited);
	// Still looking for the logo (and not yet time for the name): shimmer where it will sit
	const logoLoading = logoPath === undefined && !waited;
	return (
		<Pressable
			style={({ pressed }) => [card.episodeCard, styles.card, pressed && styles.cardPressed]}
			onPress={onPress}
			onLongPress={onLongPress}
			delayLongPress={350}
			accessibilityRole="button"
			accessibilityLabel={item.title}
		>
			{info?.backdropPath ? (
				<Image
					source={{ uri: tmdbBlurredBackdropUri(info.backdropPath) }}
					recyclingKey={`${item.mediaType}_${item.tmdbId}`}
					style={StyleSheet.absoluteFill}
					contentFit="cover"
					contentPosition="top"
					blurRadius={BLUR_RADIUS}
					transition={IMAGE_FADE_MS}
				/>
			) : info && item.posterPath ? (
				// No backdrop on TMDB (e.g. not aired yet): the poster, blurred well past recognition,
				// keeps the card in the family instead of a flat grey slab
				<Image
					source={{ uri: tmdbPosterUri(item.posterPath, 185) }}
					recyclingKey={`${item.mediaType}_${item.tmdbId}_poster`}
					style={StyleSheet.absoluteFill}
					contentFit="cover"
					blurRadius={POSTER_BLUR_RADIUS}
					transition={IMAGE_FADE_MS}
				/>
			) : infoLoading ? (
				<SkeletonLine width="100%" height={CARD_FILL} style={styles.skeletonCard} />
			) : null}
			<View style={[StyleSheet.absoluteFill, card.cardOverlay]} />
			<View style={card.epInfo}>
				{/* Fixed slot: the card never shifts as the logo / name arrives */}
				<View style={styles.logoSlot}>
					{logoPath ? (
						<Image
							source={{ uri: tmdbLogoUri(logoPath, CARD_WIDTH * 0.6) }}
							style={styles.logo}
							contentFit="contain"
							contentPosition="left center"
							transition={IMAGE_FADE_MS}
							accessibilityLabel={item.title}
						/>
					) : showName ? (
						<Text style={styles.name} numberOfLines={2}>
							{item.title}
						</Text>
					) : logoLoading ? (
						<SkeletonLine width="60%" height={28} style={styles.skeletonLogo} />
					) : null}
				</View>
				<View style={styles.metaLine}>
					<TypeBadge mediaType={item.mediaType} />
					{infoLoading ? (
						<SkeletonLine width={60} height={10} />
					) : runtime ? (
						<Text style={styles.meta} numberOfLines={1}>
							{isMovie ? runtime : `${runtime} / ep`}
						</Text>
					) : null}
				</View>
			</View>
			<View style={card.epSquare}>
				<Text style={card.epSquareTitle}>{square.label}</Text>
				<View style={card.epSquareRule} />
				{infoLoading ? (
					<SkeletonLine width={52} height={36} style={styles.skeletonValue} />
				) : (
					<Text
						style={[card.epSquareValue, styles.squareValue]}
						numberOfLines={1}
						adjustsFontSizeToFit
					>
						{square.value ?? "—"}
					</Text>
				)}
			</View>
		</Pressable>
	);
}

/** Reorder mode: a compact row; press and hold anywhere on it to pick it up, drag, drop */
export function ReorderRow({ item }: Readonly<{ item: CustomListItem }>) {
	const drag = useReorderableDrag();
	return (
		<TouchableOpacity
			style={styles.reorderRow}
			onLongPress={drag}
			delayLongPress={250}
			activeOpacity={0.8}
		>
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
					show?.runtime ??
					(show as { episode_run_time?: number[] } | undefined)?.episode_run_time?.[0] ??
					null,
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
	// The calendar card sits in the list's own padding (no side margin of its own)
	card: { marginHorizontal: 0 },
	cardPressed: { transform: [{ scale: 0.98 }] },
	logoSlot: { height: 44, justifyContent: "center", marginBottom: spacing.sm },
	logo: { height: 44, width: "75%" },
	name: { ...typography.subtitle, fontSize: 16, color: colors.onImage },
	metaLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
	meta: { ...typography.caption, color: colors.onImageSecondary, flexShrink: 1 },
	// Year / episode counts are wider than Exx — a step down so 4 digits fit the square
	squareValue: { fontSize: 44, lineHeight: 48 },
	skeletonCard: { position: "absolute", top: 0, left: 0, borderRadius: 0 },
	// Skeletons sit on the dark overlay: a lighter grey reads as a placeholder there
	skeletonLogo: { borderRadius: 6, backgroundColor: colors.textMuted },
	skeletonValue: { borderRadius: 6, marginTop: 6, backgroundColor: colors.textMuted },
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
	typeBadgeText: { color: colors.onPrimary, fontSize: 10, fontWeight: "700" },
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
