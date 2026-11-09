import React, { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import SearchCard from "../../SearchScreen/SearchCard";
import ListCardTags from "../ListCardTags";
import { getCachedCatalogShow } from "../../../hooks/useWatchlist";
import { deriveHistoryGridTags, type HistoryCard } from "../../../utils";
import { MediaType } from "../../../enums";
import type { TMDBShow } from "../../../types";
import { colors, spacing, tint } from "../../../theme";

/** Poster bottom → clear: the stats read on any poster without a hard-edged bar */
const SCRIM = [tint(colors.background, 0), tint(colors.background, 0.78), colors.background] as const;
const SCRIM_STOPS = [0, 0.38, 1] as const;

/**
 * Hall of Shame's grid card: the poster (Search's card, no watchlist badge — everything here is
 * tracked) with everything its list card says. Pills top-left (status, progress or watch count,
 * then Ongoing / Ended); at the bottom, over a scrim, the title (full width) and the two numbers — Last
 * Watched and Total Time — as a label over a value, the way the list card sets them. Static: it
 * sits in a scrolling grid, so no motion beyond the card's own press feedback.
 */
function HistoryGridCard({
	card,
	onPress,
	onAddToList,
}: Readonly<{
	card: HistoryCard & { listCount?: number };
	onPress: () => void;
	onAddToList: () => void;
}>) {
	const isMovie = card.mediaType === MediaType.MOVIE;
	const show = useMemo((): TMDBShow => {
		const catalog = getCachedCatalogShow(card.tmdbId, card.mediaType);
		const date = (isMovie ? catalog?.releaseDate : catalog?.firstAirDate) ?? undefined;
		return {
			id: card.tmdbId,
			media_type: card.mediaType,
			...(isMovie ? { title: card.title } : { name: card.title }),
			poster_path: catalog?.posterPath ?? null,
			backdrop_path: card.backdropPath,
			overview: "",
			vote_average: 0,
			genre_ids: [],
			...(isMovie ? { release_date: date } : { first_air_date: date }),
		};
	}, [card, isMovie]);
	const tags = useMemo(() => deriveHistoryGridTags(card), [card]);
	const stats = [
		card.lastWatched ? { label: "LAST WATCHED", value: card.lastWatched } : null,
		card.timeSpent ? { label: "TIME SPENT", value: card.timeSpent } : null,
	].filter((s): s is { label: string; value: string } => s !== null);
	return (
		<SearchCard
			item={show}
			isInWatchlist
			isAdding={false}
			isListed={(card.listCount ?? 0) > 0}
			overlay={tags.map((t) => (
				// Solid backing: the pills are translucent, which lost them on a busy poster
				<View key={t.kind} style={styles.tagBacking}>
					<ListCardTags tags={[t]} flush />
				</View>
			))}
			footer={
				<View style={styles.footer} pointerEvents="none">
					<LinearGradient
						colors={SCRIM}
						locations={SCRIM_STOPS}
						style={StyleSheet.absoluteFill}
					/>
					<Text style={styles.title} numberOfLines={2}>
						{card.title}
					</Text>
					{stats.length > 0 && (
						<View style={styles.stats}>
							{stats.map((s, i) => (
								<View key={s.label} style={[styles.stat, i > 0 && styles.statRight]}>
									<Text style={styles.statLabel} numberOfLines={1}>
										{s.label}
									</Text>
									<Text style={styles.statValue} numberOfLines={1}>
										{s.value}
									</Text>
								</View>
							))}
						</View>
					)}
				</View>
			}
			onPress={onPress}
			onAddToList={onAddToList}
		/>
	);
}

export default memo(HistoryGridCard);

const styles = StyleSheet.create({
	tagBacking: { borderRadius: 999, backgroundColor: colors.background },
	footer: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		// Scrim starts above the text so the fade, not the text, meets the poster
		paddingTop: spacing.xl + spacing.sm,
		paddingHorizontal: spacing.md,
		paddingBottom: spacing.sm + 2,
		gap: spacing.sm,
	},
	title: { color: colors.text, fontSize: 14, fontWeight: "700" },
	// Two numbers, left and right — one each when only one is known
	stats: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
	stat: { flexShrink: 1 },
	statRight: { alignItems: "flex-end" },
	// The list card's label-over-value pair, scaled to the poster
	statLabel: {
		color: colors.textSecondary,
		fontSize: 9,
		fontWeight: "700",
		letterSpacing: 0.8,
	},
	statValue: {
		color: tint(colors.text, 0.95),
		fontSize: 17,
		lineHeight: 20,
		fontWeight: "600",
		letterSpacing: -0.3,
		fontVariant: ["tabular-nums"],
	},
});
