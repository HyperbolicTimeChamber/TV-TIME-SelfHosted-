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
import { isPausedStatus, useResumeTitle } from "../../hooks/useResumeTitle";
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
import SearchCard from "../SearchScreen/SearchCard";
import { HiCheck } from "../../components/HiIcons";

/** The card (taller than the calendar's), and the row under the square — the add button / Tracking
 *  tag and the status tags share it, so they line up */
const CARD_HEIGHT = 136;
/** The square's corner radius (the calendar's epSquare): the button under it rounds its bottom to match */
const SQUARE_RADIUS = 14;
const BOTTOM_ROW_HEIGHT = 32;
/** The square above the button: 80 + 32 = the 112 block, + the card's 24 padding = CARD_HEIGHT */
const SQUARE_HEIGHT = 80;
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
 * The list-card tags for a title (Currently Watching / Rewatching, Paused, Watch Count — none when untracked),
 * from its own tracking doc; null until that is known. A tracked show's progress needs its episode
 * list: one batched catalog read, then cached.
 */
function useListTags(tmdbId: number, mediaType: MediaType) {
	const isMovie = mediaType === MediaType.MOVIE;
	const userId = useAuthStore((s) => s.user?.uid);
	const entry = useTrackingEntry(userId, tmdbId, mediaType);
	const [catalogVersion, setCatalogVersion] = useState(0);
	useEffect(() => {
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
					getCachedCatalogShow(tmdbId, mediaType),
					todayStr(),
					catalogSettled(tmdbId, mediaType),
				)
			: null;
		return deriveListTags(card);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [entry, catalogVersion, tmdbId, mediaType, isMovie]);
	return { tags, entry };
}

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
	// Tags: Watch History's, from the title's own tracking doc (none → no tags)
	const { tags, entry } = useListTags(item.tmdbId, item.mediaType);
	// Paused: Resume (blue) in place of the Watchlist tag
	const paused = !!entry && isPausedStatus(entry.status);
	const { resume, resuming } = useResumeTitle();
	// A show: its season count; a movie: its runtime (the year is in the square), in a translucent black pill
	const metaText = isMovie
		? runtime
		: seasons
			? `${seasons} ${seasons === 1 ? "Season" : "Seasons"}`
			: "";
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
			<View style={[card.epInfo, styles.info]}>
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
				{/* Centred between the logo and the tags, so it is equidistant from both */}
				<View style={styles.metaArea}>
					<View style={styles.metaLine}>
						<TypeBadge mediaType={item.mediaType} />
						{infoLoading ? (
							<SkeletonLine width={60} height={10} />
						) : metaText ? (
							<View style={styles.metaPill}>
								<Text style={styles.metaPillText} numberOfLines={1}>
									{metaText}
								</Text>
							</View>
						) : null}
					</View>
				</View>
				{/* Level with the add button / Tracking tag under the square */}
				<View style={styles.tagsRow}>
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
					{paused ? (
						<Pressable
							onPress={() => entry && resume(entry, item.title, item.posterPath ?? info?.posterPath ?? null)}
							disabled={resuming}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel={`Resume ${item.title}`}
							style={({ pressed }) => [
								styles.addButton,
								styles.resumeButton,
								resuming && styles.addButtonBusy,
								pressed && styles.addButtonPressed,
							]}
						>
							{resuming ? (
								<ActivityIndicator size="small" color={colors.text} />
							) : (
								<>
									<Ionicons name="play" size={12} color={colors.text} />
									<Text style={styles.addText}>Resume</Text>
								</>
							)}
						</Pressable>
					) : tracked ? (
						<View style={styles.trackingTag}>
							<HiCheck size={14} color={colors.text} />
							<Text style={styles.trackingText}>Watchlist</Text>
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

/**
 * Grid view: Search's own result card (poster, title, TV / MOVIE, year, the add-to-watchlist badge)
 * for a saved title — minus the Add to List button, since it is in a list already. The year and
 * release date come from the title's info (a list stores only the title and poster).
 */
export function ListGridCard({
	item,
	tracked,
	adding,
	onPress,
	onLongPress,
	onAdd,
	onRemove,
}: Readonly<{
	item: CustomListItem;
	tracked: boolean;
	adding: boolean;
	onPress: (item: CustomListItem) => void;
	onLongPress: (item: CustomListItem) => void;
	onAdd: (show: TMDBShow) => void;
	onRemove: (show: TMDBShow) => void;
}>) {
	const { data: info } = useTitleInfo(item.tmdbId, item.mediaType);
	const isMovie = item.mediaType === MediaType.MOVIE;
	// The same state pills as a list card, one per row over the poster's top-left
	const { tags } = useListTags(item.tmdbId, item.mediaType);
	const show = useMemo(
		(): TMDBShow => ({
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
		}),
		[item, isMovie, info],
	);
	return (
		<SearchCard
			item={show}
			isInWatchlist={tracked}
			isAdding={adding}
			overlay={tags?.map((t) => (
				// Solid backing: the pills are translucent, which lost them on a busy poster
				<View key={t.kind} style={styles.gridTagBacking}>
					<ListCardTags tags={[t]} flush />
				</View>
			))}
			onPress={() => onPress(item)}
			onLongPress={() => onLongPress(item)}
			onAdd={onAdd}
			onRemove={onRemove}
		/>
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

/** The button under the square: as wide as it, flat top (joined), bottom corners matching its top */
const JOINED_BUTTON = {
	width: 96,
	borderTopLeftRadius: 0,
	borderTopRightRadius: 0,
	borderBottomLeftRadius: SQUARE_RADIUS,
	borderBottomRightRadius: SQUARE_RADIUS,
} as const;

const styles = StyleSheet.create({
	gridTagBacking: { borderRadius: 999, backgroundColor: colors.background },
	// The calendar card sits in the list's own padding (no side margin of its own)
	// Taller than the calendar's card: the square has the add button / Tracking tag under it
	// Exactly the right block (square + button) plus the card's padding: the left column fits inside
	card: { marginHorizontal: 0, height: CARD_HEIGHT, minHeight: CARD_HEIGHT, alignItems: "stretch" },
	// The left column fills the card: logo + meta on top, the tags (level with the button) at the bottom
	// Logo + meta on top, the tags at the bottom (level with the add button under the square)
	// Logo on top, the tags at the bottom, the meta pill centred in the space between
	info: { justifyContent: "flex-start" },
	metaArea: { flex: 1, justifyContent: "center", minHeight: 0 },
	// The tag pills are 26 tall, centred on the 32 button beside them: 3 up from the bottom edge
	tagsRow: { minHeight: 26, justifyContent: "center", marginBottom: 3 },
	rightCol: {
		alignItems: "center",
		// One block: the square with the button / Tracking tag joined to its bottom edge, level
		// with the tags
		justifyContent: "flex-end",
		marginLeft: spacing.md,
	},
	// Flat bottom: the button continues it
	square: {
		marginLeft: 0,
		height: SQUARE_HEIGHT,
		borderBottomLeftRadius: 0,
		borderBottomRightRadius: 0,
	},
	bottomRow: { height: BOTTOM_ROW_HEIGHT, justifyContent: "center" },
	addButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 2,
		height: BOTTOM_ROW_HEIGHT,
		...JOINED_BUTTON,
		backgroundColor: colors.primary,
	},
	addButtonBusy: { opacity: 0.6 },
	// The info page's Resume blue
	resumeButton: { gap: 4, backgroundColor: colors.accent },
	addButtonPressed: { transform: [{ scale: 0.97 }] },
	addText: { color: colors.text, fontSize: 12, fontWeight: "700" },
	// The same joined block, in green
	trackingTag: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 4,
		height: BOTTOM_ROW_HEIGHT,
		...JOINED_BUTTON,
		backgroundColor: colors.watchedGreen,
	},
	trackingText: { color: colors.text, fontSize: 12, fontWeight: "700" },
	cardPressed: { transform: [{ scale: 0.98 }] },
	logoSlot: {
		flexShrink: 1,
		maxHeight: 44,
		minHeight: 24,
		height: 44,
		justifyContent: "center",
	},
	logo: { height: "100%", width: "75%" },
	name: { ...typography.subtitle, fontSize: 16 },
	metaLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
	// Season count / year over the backdrop: a translucent black pill, like the card's square
	metaPill: {
		backgroundColor: colors.badgeOverlay,
		borderRadius: 999,
		paddingHorizontal: 8,
		paddingVertical: 3,
	},
	metaPillText: { color: colors.text, fontSize: 11, fontWeight: "700" },
	meta: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
	// Year / episode counts are wider than Exx — a step down so 4 digits fit the square
	squareValue: { fontSize: 36, lineHeight: 40 },
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
