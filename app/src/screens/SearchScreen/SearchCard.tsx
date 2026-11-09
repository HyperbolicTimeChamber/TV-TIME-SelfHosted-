import { memo, type ReactNode } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme";
import { TMDBShow, MediaType } from "../../types";
import { CustomListView } from "../../enums";
import PosterImage from "../../components/PosterImage";
import { tmdbBlurredBackdropUri } from "../../hooks/useTmdbImage";
import { styles } from "./styles";
import { HiCheck } from "../../components/HiIcons";

/** List rows: the backdrop washes in instead of popping (as on the list page's cards) */
const BACKDROP_FADE_MS = 200;
const BACKDROP_BLUR_RADIUS = 0.5;
/** Grid banner: dark at the bottom, fading to clear at its top edge */
const BANNER_FADE = ["transparent", "rgba(0, 0, 0, 0.6)", "rgba(0, 0, 0, 0.85)"] as const;
const BANNER_FADE_STOPS = [0, 0.4, 1] as const;

interface Props {
	item: TMDBShow;
	isInWatchlist: boolean;
	isAdding: boolean;
	/** In at least one custom list */
	isListed?: boolean;
	/** Grid (poster card, default) or List (a row: poster, title, meta, overview) */
	layout?: CustomListView;
	onPress: (item: TMDBShow) => void;
	/** Without these the card has no watchlist badge (Hall of Shame: everything there is tracked) */
	onAdd?: (item: TMDBShow) => void;
	onRemove?: (item: TMDBShow) => void;
	/** Pills over the poster's top-left (a list's own grid: the title's state tags) */
	overlay?: ReactNode;
	/** In place of the title / year banner (Hall of Shame's grid: title + its stats) */
	footer?: ReactNode;
	/** Without it the card has no Add to List button (a list's own grid) */
	onAddToList?: (item: TMDBShow) => void;
	onLongPress?: (item: TMDBShow) => void;
}

function TypeBadge({ mediaType }: Readonly<{ mediaType: MediaType }>) {
	return (
		<View style={[styles.typeBadge, mediaType === MediaType.MOVIE && styles.typeBadgeMovie]}>
			<Text style={styles.typeBadgeText}>{mediaType === MediaType.TV ? "TV" : "MOVIE"}</Text>
		</View>
	);
}

function SearchCard({
	item,
	isInWatchlist,
	isAdding,
	isListed = false,
	layout = CustomListView.GRID,
	onPress,
	onAdd,
	onRemove,
	onAddToList,
	onLongPress,
	overlay,
	footer,
}: Readonly<Props>) {
	const title = item.name || item.title || "";
	const year = (item.first_air_date || item.release_date || "").substring(0, 4);
	const mediaType: MediaType =
		item.media_type ||
		(item.first_air_date || (item.name && !item.title) ? MediaType.TV : MediaType.MOVIE);
	const isList = layout === CustomListView.LIST;

	const watchlistBadge = onAdd && onRemove && (
		<TouchableOpacity
			style={[
				styles.watchlistBadge,
				isList && styles.rowBadge,
				isInWatchlist && styles.watchlistBadgeActive,
			]}
			onPress={(e) => {
				e.stopPropagation?.();
				if (isAdding) return;
				if (isInWatchlist) {
					onRemove(item);
				} else {
					onAdd(item);
				}
			}}
			hitSlop={{ top: 5, bottom: 5, left: 8, right: 8 }}
			activeOpacity={0.7}
			disabled={isAdding}
			accessibilityLabel={isInWatchlist ? "Remove from watchlist" : "Add to watchlist"}
		>
			{isAdding ? (
				<ActivityIndicator size="small" color={colors.text} />
			) : // Vector glyphs sit in the middle of their box — a text "+" rode high and off centre
			isInWatchlist ? (
				<HiCheck size={18} color={colors.text} />
			) : (
				<Ionicons name="add" size={18} color={colors.text} />
			)}
		</TouchableOpacity>
	);
	const listBadge = onAddToList && (
		<TouchableOpacity
			style={[
				styles.listBadge,
				!onAdd && styles.listBadgeTop,
				isList && styles.rowBadge,
				isListed && styles.listBadgeActive,
			]}
			onPress={(e) => {
				e.stopPropagation?.();
				onAddToList(item);
			}}
			hitSlop={{ top: 5, bottom: 5, left: 8, right: 8 }}
			activeOpacity={0.7}
			accessibilityLabel="Add to List"
		>
			<Ionicons name={isListed ? "bookmark" : "bookmark-outline"} size={14} color={colors.text} />
		</TouchableOpacity>
	);

	if (isList) {
		return (
			<TouchableOpacity
				style={styles.rowCard}
				onPress={() => onPress(item)}
				onLongPress={onLongPress ? () => onLongPress(item) : undefined}
				delayLongPress={350}
				activeOpacity={0.7}
			>
				{item.backdrop_path ? (
					<Image
						source={{ uri: tmdbBlurredBackdropUri(item.backdrop_path) }}
						recyclingKey={`${mediaType}_${item.id}`}
						style={StyleSheet.absoluteFill}
						contentFit="cover"
						blurRadius={BACKDROP_BLUR_RADIUS}
						transition={BACKDROP_FADE_MS}
					/>
				) : null}
				<View style={[StyleSheet.absoluteFill, styles.rowOverlay]} />
				<PosterImage posterPath={item.poster_path} mediaType={mediaType} style={styles.rowPoster} />
				<View style={styles.rowInfo}>
					<Text style={styles.rowTitle} numberOfLines={2}>
						{title}
					</Text>
					<View style={styles.rowMeta}>
						<TypeBadge mediaType={mediaType} />
						{year ? <Text style={styles.rowMetaText}>{year}</Text> : null}
						{item.vote_average > 0 ? (
							<Text style={styles.rowMetaText}>★ {item.vote_average.toFixed(1)}</Text>
						) : null}
					</View>
					{item.overview ? (
						<Text style={styles.rowOverview} numberOfLines={2}>
							{item.overview}
						</Text>
					) : null}
				</View>
				{(watchlistBadge || listBadge) && (
					<View style={styles.rowBadges}>
						{watchlistBadge}
						{listBadge}
					</View>
				)}
			</TouchableOpacity>
		);
	}

	return (
		<TouchableOpacity
			style={styles.card}
			onPress={() => onPress(item)}
			onLongPress={onLongPress ? () => onLongPress(item) : undefined}
			delayLongPress={350}
			activeOpacity={0.7}
		>
			<PosterImage posterPath={item.poster_path} mediaType={mediaType} style={styles.poster} />
			{watchlistBadge}
			{listBadge}
			{overlay && (
				<View style={styles.overlayTags} pointerEvents="none">
					{overlay}
				</View>
			)}
			{footer ?? (
				<View style={styles.banner}>
					{/* Fades up into the poster instead of a hard-edged bar */}
					<LinearGradient
						colors={BANNER_FADE}
						locations={BANNER_FADE_STOPS}
						style={StyleSheet.absoluteFill}
					/>
					<View style={styles.bannerTop}>
						<Text style={styles.cardTitle} numberOfLines={2}>
							{title}
						</Text>
						{/* The year under the pill, beside the title — no line of its own */}
						<View style={styles.bannerSide}>
							<TypeBadge mediaType={mediaType} />
							{year ? <Text style={styles.cardYear}>{year}</Text> : null}
						</View>
					</View>
				</View>
			)}
		</TouchableOpacity>
	);
}

export default memo(SearchCard);
