import React, { useEffect, useMemo, useState } from "react";
import {
	View,
	Text,
	TouchableOpacity,
	Pressable,
	StyleSheet,
	ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useReorderableDrag } from "react-native-reorderable-list";
import { MediaType, type CustomListItem, type TMDBShow } from "../../types";
import { useShowDetails, useTitleInfo, useTrackingEntry } from "../../hooks";
import { useAuthStore } from "../../stores";
import { catalogSettled, ensureFreshCatalogs } from "../../hooks/catalogRefresh";
import { getCachedCatalogShow } from "../../hooks/useWatchlist";
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
import { deriveHistoryCard, deriveListTags, formatRuntime, todayStr } from "../../utils";
import ListCardTags from "./ListCardTags";

/** The card (taller than the calendar's), and the row under the square — the add button / Tracking
 *  tag and the status tags share it, so they line up */
const CARD_MIN_HEIGHT = 168;
const BOTTOM_ROW_HEIGHT = 28;
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
	/** On the watchlist already (a green Tracking tag instead of the add button) */
	tracked: boolean;
	adding: boolean;
	onAddToWatchlist: (show: TMDBShow) => void;
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
export function ListRow({
	item,
	onPress,
	onLongPress,
	tracked,
	adding,
	onAddToWatchlist,
}: Readonly<RowProps>) {
	const { data: info, isPending: infoLoading } = useTitleInfo(item.tmdbId, item.mediaType);
	const logoPath = useTitleLogo(undefined, item.tmdbId, item.mediaType);
	const [waited, setWaited] = useState(false);
	useEffect(() => {
		const t = setTimeout(() => setWaited(true), NAME_DELAY_MS);
		return () => clearTimeout(t);
	}, []);
	const isMovie = item.mediaType === MediaType.MOVIE;
	const runtime = formatRuntime(info?.runtime);
	const seasons = info?.totalSeasons;
	// A show: its season count beside the TV tag, its episode count in the square
	const square = isMovie
		? { label: "YEAR", value: info?.year ?? null }
		: { label: "EPISODES", value: info?.totalEpisodes ? String(info.totalEpisodes) : null };
	// What the shared add flow takes (Search's): a movie's release date decides whether it is
	// added as unreleased, so the button waits for it
	const addShow = (): TMDBShow => ({
		id: item.tmdbId,
		media_type: item.mediaType,
		...(isMovie ? { title: item.title } : { name: item.title }),
		poster_path: item.posterPath ?? info?.posterPath ?? null,
		backdrop_path: info?.backdropPath ?? null,
		overview: "",
		vote_average: 0,
		genre_ids: [],
		...(isMovie
			? { release_date: info?.releaseDate ?? undefined }
			: { first_air_date: info?.releaseDate ?? undefined }),
	});
	// Tags: Watch History's, from the title's own tracking doc (none → Not Started)
	const userId = useAuthStore((s) => s.user?.uid);
	const entry = useTrackingEntry(userId, item.tmdbId, item.mediaType);
	const [catalogVersion, setCatalogVersion] = useState(0);
	useEffect(() => {
		// A tracked show's progress needs its episode list: one batched catalog read, then cached
		if (!entry || isMovie) return;
		ensureFreshCatalogs([entry])
			.catch(() => false)
			.then((fetched) => fetched && setCatalogVersion((v) => v + 1));
	}, [entry, isMovie]);
	const tags = useMemo(() => {
		if (entry === undefined) return null;
		const card = entry
			? deriveHistoryCard(
					entry,
					getCachedCatalogShow(item.tmdbId, item.mediaType),
					todayStr(),
					catalogSettled(item.tmdbId, item.mediaType),
				)
			: null;
		return deriveListTags(card);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [entry, catalogVersion, item.tmdbId, item.mediaType]);
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
					) : isMovie ? (
						runtime ? (
							<Text style={styles.meta} numberOfLines={1}>
								{runtime}
							</Text>
						) : null
					) : seasons ? (
						<Text style={styles.meta} numberOfLines={1}>
							{seasons} {seasons === 1 ? "season" : "seasons"}
						</Text>
					) : null}
				</View>
				{/* Level with the add button / Tracking tag under the square */}
				<View style={styles.bottomRow}>
					{tags ? (
						<ListCardTags tags={tags} flush />
					) : (
						<SkeletonLine width={150} height={20} style={styles.skeletonTags} />
					)}
				</View>
			</View>
			<View style={styles.rightCol}>
			<View style={[card.epSquare, styles.square]}>
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
			<View style={styles.bottomRow}>
				{tracked ? (
					<View style={styles.trackingTag}>
						<Ionicons name="checkmark-circle-outline" size={14} color={colors.text} />
						<Text style={styles.trackingText}>Tracking</Text>
					</View>
				) : (
					<Pressable
						onPress={() => onAddToWatchlist(addShow())}
						disabled={adding || infoLoading}
						hitSlop={8}
						accessibilityRole="button"
						accessibilityLabel={`Add ${item.title} to watchlist`}
						style={({ pressed }) => [
							styles.addButton,
							(adding || infoLoading) && styles.addButtonBusy,
							pressed && styles.addButtonPressed,
						]}
					>
						{adding ? (
							<ActivityIndicator size="small" color={colors.text} />
						) : (
							<>
								<Ionicons name="add" size={14} color={colors.text} />
								<Text style={styles.addText}>Watchlist</Text>
							</>
						)}
					</Pressable>
				)}
			</View>
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
	// Taller than the calendar's card: the square has the add button / Tracking tag under it
	card: { marginHorizontal: 0, minHeight: CARD_MIN_HEIGHT, alignItems: "stretch" },
	// The left column fills the card: logo + meta on top, the tags (level with the button) at the bottom
	rightCol: { alignItems: "center", gap: spacing.sm, marginLeft: spacing.md },
	square: { marginLeft: 0 },
	bottomRow: { height: BOTTOM_ROW_HEIGHT, justifyContent: "center" },
	addButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 2,
		height: BOTTOM_ROW_HEIGHT,
		minWidth: 96,
		paddingHorizontal: spacing.md,
		borderRadius: 999,
		backgroundColor: colors.primary,
	},
	addButtonBusy: { opacity: 0.6 },
	addButtonPressed: { transform: [{ scale: 0.97 }] },
	addText: { color: colors.text, fontSize: 12, fontWeight: "700" },
	// Same pill as the tag line's, in green
	trackingTag: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 4,
		height: BOTTOM_ROW_HEIGHT,
		minWidth: 96,
		paddingHorizontal: spacing.md,
		borderRadius: 999,
		backgroundColor: colors.watchedGreen,
	},
	trackingText: { color: colors.text, fontSize: 12, fontWeight: "700" },
	cardPressed: { transform: [{ scale: 0.98 }] },
	logoSlot: { height: 44, justifyContent: "center", marginBottom: spacing.sm },
	logo: { height: 44, width: "75%" },
	name: { ...typography.subtitle, fontSize: 16 },
	metaLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
	meta: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
	// Year / episode counts are wider than Exx — a step down so 4 digits fit the square
	squareValue: { fontSize: 44, lineHeight: 48 },
	skeletonCard: { position: "absolute", top: 0, left: 0, borderRadius: 0 },
	// Skeletons sit on the dark overlay: a lighter grey reads as a placeholder there
	skeletonLogo: { borderRadius: 6, backgroundColor: colors.textMuted },
	skeletonTags: { borderRadius: 999, marginTop: spacing.sm, backgroundColor: colors.textMuted },
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
