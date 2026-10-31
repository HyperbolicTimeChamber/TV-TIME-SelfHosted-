import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, useWindowDimensions } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../stores";
import { useCustomLists } from "../../hooks";
import { CircleButtonTone, Route } from "../../enums";
import type { CustomListItem, ProfileStackParamList } from "../../types";
import { ConfirmModal, ListNameModal } from "../../components";
import CircleButton, { CircleBackButton } from "../../components/CircleButton";
import PosterImage from "../../components/PosterImage";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import { colors, spacing, typography } from "../../theme";

type Nav = NativeStackNavigationProp<ProfileStackParamList, Route.LIST_DETAIL>;

const COLUMNS = 3;

const RENAME_ERRORS = {
	taken: "You already have a list with that name.",
	empty: "Give the list a name.",
	failed: "Couldn't rename the list. Check your connection and try again.",
} as const;

/** One custom list: its titles as a poster grid. Tap opens the title; long-press removes it from the list */
export default function ListDetailScreen() {
	const navigation = useNavigation<Nav>();
	const swipeBack = useSwipeBackPop(navigation);
	const { listId } = useRoute<RouteProp<ProfileStackParamList, Route.LIST_DETAIL>>().params;
	const { top } = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const user = useAuthStore((s) => s.user);
	const { lists, loading, renameList, deleteList, removeFromList } = useCustomLists(user?.uid);
	const list = lists.find((l) => l.id === listId);

	const [renaming, setRenaming] = useState(false);
	const [renameError, setRenameError] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [removeTarget, setRemoveTarget] = useState<CustomListItem | null>(null);

	const goBack = useCallback(() => navigation.goBack(), [navigation]);

	// Deleted (here or on another device): nothing left to show
	useEffect(() => {
		if (!loading && !list) goBack();
	}, [loading, list, goBack]);

	const posterWidth = useMemo(() => {
		const gap = spacing.sm * (COLUMNS - 1);
		return Math.floor((width - spacing.lg * 2 - gap) / COLUMNS);
	}, [width]);

	if (!list) return null;

	const handleRename = async (name: string) => {
		const result = await renameList(listId, name);
		if (result === "ok") {
			setRenaming(false);
			setRenameError(null);
		} else {
			setRenameError(RENAME_ERRORS[result]);
		}
	};

	return (
		<SwipeBackView onBack={goBack} {...swipeBack} style={styles.container}>
			<View style={[styles.topBar, { paddingTop: top + 8 }]}>
				<CircleBackButton tone={CircleButtonTone.SURFACE_LIGHT} onPress={goBack} />
				<Text style={styles.title} numberOfLines={1}>
					{list.name}
				</Text>
				<CircleButton
					tone={CircleButtonTone.SURFACE_LIGHT}
					onPress={() => {
						setRenameError(null);
						setRenaming(true);
					}}
					accessibilityLabel="Rename list"
				>
					<Ionicons name="create-outline" size={22} color={colors.text} />
				</CircleButton>
				<CircleButton
					tone={CircleButtonTone.SURFACE_LIGHT}
					onPress={() => setConfirmDelete(true)}
					accessibilityLabel="Delete list"
				>
					<Ionicons name="trash-outline" size={22} color={colors.destructiveRed} />
				</CircleButton>
			</View>

			{list.items.length === 0 ? (
				<View style={styles.empty}>
					<Ionicons name="bookmarks-outline" size={40} color={colors.textMuted} />
					<Text style={styles.emptyTitle}>This list is empty</Text>
					<Text style={styles.emptyHint}>
						Tap the bookmark on a show or movie in Search to add it here.
					</Text>
				</View>
			) : (
				<FlatList
					data={list.items}
					keyExtractor={(item) => `${item.mediaType}_${item.tmdbId}`}
					numColumns={COLUMNS}
					columnWrapperStyle={styles.row}
					contentContainerStyle={styles.grid}
					ListHeaderComponent={
						<Text style={styles.count}>
							{list.items.length} {list.items.length === 1 ? "title" : "titles"} · long-press to remove
						</Text>
					}
					renderItem={({ item }) => (
						<TouchableOpacity
							activeOpacity={0.7}
							onPress={() =>
								navigation.navigate(Route.SHOW_DETAIL, {
									tmdbId: item.tmdbId,
									mediaType: item.mediaType,
								})
							}
							onLongPress={() => setRemoveTarget(item)}
							delayLongPress={350}
						>
							<PosterImage
								posterPath={item.posterPath}
								mediaType={item.mediaType}
								style={{ width: posterWidth, height: posterWidth * 1.5, borderRadius: 6 }}
								title={!item.posterPath ? item.title : undefined}
							/>
						</TouchableOpacity>
					)}
				/>
			)}

			<ListNameModal
				visible={renaming}
				title="Rename List"
				initialName={list.name}
				error={renameError}
				onSubmit={handleRename}
				onClose={() => setRenaming(false)}
			/>

			<ConfirmModal
				visible={confirmDelete}
				title="Delete List?"
				hint={`"${list.name}" will be deleted. The shows and movies in it aren't affected — your watchlist and history stay as they are.`}
				confirmLabel="Delete"
				onConfirm={() => {
					setConfirmDelete(false);
					deleteList(listId);
				}}
				onClose={() => setConfirmDelete(false)}
			/>

			<ConfirmModal
				visible={!!removeTarget}
				title="Remove From List?"
				hint={`Remove "${removeTarget?.title ?? ""}" from "${list.name}"? It stays in your watchlist if it's there.`}
				confirmLabel="Remove"
				onConfirm={() => {
					if (removeTarget) removeFromList(listId, removeTarget.tmdbId, removeTarget.mediaType);
					setRemoveTarget(null);
				}}
				onClose={() => setRemoveTarget(null)}
			/>
		</SwipeBackView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: colors.background },
	topBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingHorizontal: spacing.lg,
		paddingBottom: spacing.md,
		backgroundColor: colors.background,
	},
	title: { flex: 1, fontSize: 20, fontWeight: "700", color: colors.text },
	grid: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl * 2 },
	row: { gap: spacing.sm, marginBottom: spacing.sm },
	count: { ...typography.caption, marginBottom: spacing.md },
	empty: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xxl,
		paddingBottom: 120,
		gap: spacing.sm,
	},
	emptyTitle: { ...typography.subtitle, fontSize: 18 },
	emptyHint: { ...typography.caption, textAlign: "center" },
});
