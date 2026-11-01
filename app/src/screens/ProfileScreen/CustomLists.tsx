import React, { useState } from "react";
import {
	View,
	Text,
	FlatList,
	ActivityIndicator,
	TouchableOpacity,
	StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "../../theme";
import type { CustomListEntry, MediaType } from "../../types";
import { useCustomLists, useRecentlyWatched } from "../../hooks";
import PosterImage from "../../components/PosterImage";
import { ListNameModal } from "../../components";
import { ModalArt, NEW_LIST_ART, NEW_LIST_RATIO } from "../../components/modals/ModalArt";
import { NEW_LIST_HINTS, NEW_LIST_TITLE } from "../../enums";
import { profileLists } from "../../utils";
import { styles as profileStyles } from "./styles";

/** Posters shown per list on the profile; the rest are one tap away on the list's page */
const PREVIEW_COUNT = 15;

const NAME_ERRORS = {
	taken: "You already have a list with that name.",
	limit: "You've reached the maximum number of lists.",
	failed: "Couldn't create the list. Check your connection and try again.",
	empty: "Give the list a name.",
} as const;

interface Props {
	userId: string | undefined;
	/** The "Lists" banner: the page that manages every list */
	onOpenLists: () => void;
	/** The Recently Watched row's header: Watch History */
	onOpenHistory: () => void;
	onOpenList: (listId: string) => void;
	onOpenTitle: (tmdbId: number, mediaType: MediaType) => void;
}

/** "Lists" on the profile, under Recently Completed: a Recently Watched row first, then the
 *  biggest custom lists — a row of posters each */
export default function CustomLists({
	userId,
	onOpenLists,
	onOpenHistory,
	onOpenList,
	onOpenTitle,
}: Readonly<Props>) {
	const { lists, loading, createList } = useCustomLists(userId);
	const shown = profileLists(lists);
	const recent = useRecentlyWatched();
	const [naming, setNaming] = useState(false);
	const [creating, setCreating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const closeNaming = () => {
		setNaming(false);
		setError(null);
	};
	const handleCreate = async (name: string) => {
		setCreating(true);
		const result = await createList(name);
		setCreating(false);
		if (result.ok) {
			closeNaming();
			onOpenList(result.list.id);
		} else {
			setError(NAME_ERRORS[result.reason]);
		}
	};

	return (
		<View style={profileStyles.section}>
			<View style={styles.header}>
				<TouchableOpacity
					style={styles.bannerTitle}
					onPress={onOpenLists}
					activeOpacity={0.7}
					accessibilityRole="button"
					accessibilityLabel="Open Lists"
				>
					<Text style={[profileStyles.sectionTitle, styles.title]}>Lists</Text>
					<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
				</TouchableOpacity>
				<TouchableOpacity
					onPress={() => setNaming(true)}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
					accessibilityLabel="New list"
				>
					<Ionicons name="add-circle-outline" size={26} color={colors.text} />
				</TouchableOpacity>
			</View>

			{recent.items.length > 0 && (
				<View style={profileStyles.genreSection}>
					<TouchableOpacity style={styles.listHeader} onPress={onOpenHistory} activeOpacity={0.7}>
						<Text style={styles.listName} numberOfLines={1}>
							Recently Watched
						</Text>
						<Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
					</TouchableOpacity>
					<PosterRow items={recent.items} onOpenTitle={onOpenTitle} />
				</View>
			)}

			{loading && lists.length === 0 ? (
				<ActivityIndicator style={styles.loader} size="small" color={colors.primary} />
			) : lists.length === 0 ? (
				<TouchableOpacity
					style={styles.emptyCard}
					onPress={() => setNaming(true)}
					activeOpacity={0.7}
				>
					<Ionicons name="bookmarks-outline" size={28} color={colors.textMuted} />
					<Text style={styles.emptyTitle}>Make your first list</Text>
					<Text style={styles.emptyHint}>
						Save shows and movies for later without adding them to your watchlist.
					</Text>
				</TouchableOpacity>
			) : (
				shown.map((list) => (
					<View key={list.id} style={profileStyles.genreSection}>
						<TouchableOpacity
							style={styles.listHeader}
							onPress={() => onOpenList(list.id)}
							activeOpacity={0.7}
						>
							<Text style={styles.listName} numberOfLines={1}>
								{list.name}
							</Text>
							<Text style={styles.count}>{list.items.length}</Text>
							<Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
						</TouchableOpacity>
						{list.items.length === 0 ? (
							<Text style={styles.listEmpty}>Nothing here yet. Add titles from Search.</Text>
						) : (
							<PosterRow items={list.items} onOpenTitle={onOpenTitle} />
						)}
					</View>
				))
			)}

			<ListNameModal
				visible={naming}
				title={NEW_LIST_TITLE}
				image={<ModalArt source={NEW_LIST_ART} ratio={NEW_LIST_RATIO} />}
				hint={NEW_LIST_HINTS}
				confirmLabel="Create"
				error={error}
				loading={creating}
				onSubmit={handleCreate}
				onClose={closeNaming}
			/>
		</View>
	);
}

/** First posters in a row (tap one to open the title) */
function PosterRow({
	items,
	onOpenTitle,
}: {
	items: ReadonlyArray<Pick<CustomListEntry, "tmdbId" | "mediaType" | "title" | "posterPath">>;
	onOpenTitle: Props["onOpenTitle"];
}) {
	return (
		<FlatList
			horizontal
			data={items.slice(0, PREVIEW_COUNT)}
			keyExtractor={(item) => `${item.mediaType}_${item.tmdbId}`}
			showsHorizontalScrollIndicator={false}
			style={{ marginHorizontal: -spacing.lg }}
			contentContainerStyle={{ paddingHorizontal: spacing.lg }}
			renderItem={({ item }) => (
				<TouchableOpacity
					activeOpacity={0.7}
					onPress={() => onOpenTitle(item.tmdbId, item.mediaType)}
				>
					<PosterImage
						posterPath={item.posterPath}
						mediaType={item.mediaType}
						style={profileStyles.completedPoster}
						title={!item.posterPath ? item.title : undefined}
					/>
				</TouchableOpacity>
			)}
			ItemSeparatorComponent={() => <View style={{ width: spacing.sm }} />}
		/>
	);
}

const styles = StyleSheet.create({
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: spacing.md,
	},
	// The section title's own bottom margin would double up inside the header row
	title: { marginBottom: 0 },
	bannerTitle: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs },
	loader: { marginVertical: spacing.lg },
	listHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginBottom: spacing.sm,
	},
	listName: { ...typography.caption, color: colors.text, flexShrink: 1 },
	count: { ...typography.caption, color: colors.textMuted },
	listEmpty: { ...typography.caption, color: colors.textMuted },
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
