import React from "react";
import { View, Text, FlatList, ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "../../theme";
import type { CustomListEntry, MediaType } from "../../types";
import { useCustomLists } from "../../hooks";
import PosterImage from "../../components/PosterImage";
import { profileLists } from "../../utils";
import { styles as profileStyles } from "./styles";

/** Posters shown per row on the profile; a "+N" tile after them opens the rest */
const PREVIEW_COUNT = 15;

type PosterItem = Pick<CustomListEntry, "tmdbId" | "mediaType" | "title" | "posterPath">;

interface Props {
	userId: string | undefined;
	/** The "Lists" banner: the page that manages every list (and makes new ones) */
	onOpenLists: () => void;
	onOpenList: (listId: string) => void;
	onOpenTitle: (tmdbId: number, mediaType: MediaType) => void;
}

/** "Lists" on the profile, under Recently Completed: a Recently Watched row first, then the
 *  biggest custom lists — a row of posters each. New lists are made on the Lists page */
export default function CustomLists({
	userId,
	onOpenLists,
	onOpenList,
	onOpenTitle,
}: Readonly<Props>) {
	const { lists, loading } = useCustomLists(userId);
	const shown = profileLists(lists);

	return (
		<View style={profileStyles.section}>
			<Pressable
				style={({ pressed }) => [styles.banner, pressed && styles.pressedCard]}
				onPress={onOpenLists}
				accessibilityRole="button"
				accessibilityLabel="Open Lists"
			>
				<Text style={[profileStyles.sectionTitle, styles.bannerText]}>Lists</Text>
				{lists.length > 0 && (
					<View style={[styles.countPill, styles.bannerPill]}>
						<Text style={styles.countText}>{lists.length}</Text>
					</View>
				)}
				<View style={styles.spacer} />
				<Text style={styles.seeAll}>See all</Text>
				<Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
			</Pressable>

			{loading && lists.length === 0 ? (
				<ActivityIndicator style={styles.loader} size="small" color={colors.primary} />
			) : lists.length === 0 ? (
				<Pressable
					style={({ pressed }) => [styles.emptyCard, pressed && styles.pressedCard]}
					onPress={onOpenLists}
					accessibilityRole="button"
				>
					<Ionicons name="bookmarks-outline" size={28} color={colors.textMuted} />
					<Text style={styles.emptyTitle}>Make your first list</Text>
					<Text style={styles.emptyHint}>
						Save shows and movies for later without adding them to your watchlist.
					</Text>
				</Pressable>
			) : (
				shown.map((list) => (
					<Row
						key={list.id}
						name={list.name}
						count={list.items.length}
						onOpen={() => onOpenList(list.id)}
						items={list.items}
						onOpenTitle={onOpenTitle}
					/>
				))
			)}
		</View>
	);
}

/** One row: a header (name, count, chevron on the right — the whole line opens it) over posters.
 *  No `onOpen` (Recently Watched): a plain label, no chevron — only its posters are tappable */
function Row({
	icon,
	name,
	count,
	onOpen,
	items,
	onOpenTitle,
}: {
	/** Marks an automatic row (Recently Watched) apart from the user's own lists */
	icon?: React.ComponentProps<typeof Ionicons>["name"];
	name: string;
	count?: number;
	onOpen?: () => void;
	items: ReadonlyArray<PosterItem>;
	onOpenTitle: Props["onOpenTitle"];
}) {
	const label = (
		<>
			{icon && <Ionicons name={icon} size={16} color={colors.textSecondary} />}
			<Text style={styles.rowName} numberOfLines={1}>
				{name}
			</Text>
			{count !== undefined && (
				<View style={styles.countPill}>
					<Text style={styles.countText}>{count}</Text>
				</View>
			)}
		</>
	);
	if (!onOpen) {
		return (
			<View style={styles.row}>
				<View style={styles.rowHeader}>{label}</View>
				<PosterRow items={items} onOpenTitle={onOpenTitle} />
			</View>
		);
	}
	return (
		<View style={styles.row}>
			<Pressable
				style={({ pressed }) => [styles.rowHeader, pressed && styles.pressedText]}
				onPress={onOpen}
				hitSlop={{ top: 6, bottom: 6 }}
				accessibilityRole="button"
				accessibilityLabel={count === undefined ? name : `${name}, ${count}`}
			>
				{label}
				<View style={styles.spacer} />
				<Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
			</Pressable>
			<PosterRow items={items} onOpenTitle={onOpenTitle} onOpenAll={onOpen} />
		</View>
	);
}

/** First posters in a row (tap one to open the title); more than fit (and somewhere to open them)
 *  → a "+N" tile opens the rest */
function PosterRow({
	items,
	onOpenTitle,
	onOpenAll,
}: {
	items: ReadonlyArray<PosterItem>;
	onOpenTitle: Props["onOpenTitle"];
	onOpenAll?: () => void;
}) {
	const more = items.length - PREVIEW_COUNT;
	return (
		<FlatList
			horizontal
			data={items.slice(0, PREVIEW_COUNT)}
			keyExtractor={(item) => `${item.mediaType}_${item.tmdbId}`}
			showsHorizontalScrollIndicator={false}
			style={styles.posterScroll}
			contentContainerStyle={styles.posterContent}
			renderItem={({ item }) => (
				<Pressable
					onPress={() => onOpenTitle(item.tmdbId, item.mediaType)}
					style={({ pressed }) => pressed && styles.pressedPoster}
					accessibilityRole="button"
					accessibilityLabel={item.title}
				>
					<PosterImage
						posterPath={item.posterPath}
						mediaType={item.mediaType}
						style={profileStyles.completedPoster}
						title={!item.posterPath ? item.title : undefined}
					/>
				</Pressable>
			)}
			ListFooterComponent={
				more > 0 && onOpenAll ? (
					<Pressable
						style={({ pressed }) => [styles.moreTile, pressed && styles.pressedPoster]}
						onPress={onOpenAll}
						accessibilityRole="button"
						accessibilityLabel={`${more} more`}
					>
						<Text style={styles.moreText}>+{more}</Text>
					</Pressable>
				) : null
			}
			ItemSeparatorComponent={() => <View style={styles.posterGap} />}
		/>
	);
}

const POSTER = profileStyles.completedPoster;

const styles = StyleSheet.create({
	// Long grey button, Hall of Shame's shape (56 tall, radius 16) — laid out like each row's
	// header (count pill left, chevron right), one size up
	banner: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		height: 56,
		borderRadius: 16,
		paddingHorizontal: spacing.lg,
		backgroundColor: colors.surfaceLight,
		marginBottom: spacing.lg,
	},
	// One step lighter than the button, so it still reads as a pill on it
	bannerPill: { backgroundColor: colors.border },
	seeAll: { color: colors.textSecondary, fontSize: 13, marginRight: -spacing.xs },
	// The section title's own bottom margin would double up inside the banner
	bannerText: { marginBottom: 0 },
	row: { marginBottom: spacing.lg },
	rowHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginBottom: spacing.sm,
	},
	rowName: { ...typography.subtitle, fontSize: 15, flexShrink: 1 },
	countPill: {
		backgroundColor: colors.surfaceLight,
		borderRadius: 8,
		paddingHorizontal: 6,
		paddingVertical: 1,
	},
	countText: { color: colors.textSecondary, fontSize: 12, fontVariant: ["tabular-nums"] },
	spacer: { flex: 1 },
	// Text links dim; tiles shrink a touch — instant feedback without a washed-out flash
	pressedText: { opacity: 0.6 },
	pressedPoster: { transform: [{ scale: 0.96 }] },
	pressedCard: { transform: [{ scale: 0.98 }] },
	posterScroll: { marginHorizontal: -spacing.lg },
	posterContent: { paddingHorizontal: spacing.lg },
	posterGap: { width: spacing.sm },
	moreTile: {
		width: POSTER.width,
		height: POSTER.height,
		borderRadius: POSTER.borderRadius,
		backgroundColor: colors.surface,
		alignItems: "center",
		justifyContent: "center",
		marginLeft: spacing.sm,
	},
	moreText: { ...typography.subtitle, fontSize: 16, color: colors.textSecondary },
	loader: { marginVertical: spacing.lg },
	emptyCard: {
		backgroundColor: colors.surface,
		borderRadius: 12,
		padding: spacing.lg,
		alignItems: "center",
		gap: spacing.xs,
	},
	emptyTitle: { ...typography.subtitle, fontSize: 15, marginTop: spacing.xs },
	emptyHint: { ...typography.caption, textAlign: "center" },
});
