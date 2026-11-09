import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Animated,
	Keyboard,
	Linking,
	Modal,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
// Gesture-handler Pressable: inside the sheet, React Native's lost taps to the sheet's gestures
import { GestureHandlerRootView, Pressable } from "react-native-gesture-handler";
import Reanimated, {
	FadeIn,
	FadeInDown,
	type SharedValue,
	useAnimatedStyle,
	useSharedValue,
} from "react-native-reanimated";
import GorhomSheet, {
	BottomSheetBackdrop,
	BottomSheetFlatList,
	BottomSheetTextInput,
	useBottomSheetInternal,
	useBottomSheetSpringConfigs,
	type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCastPages } from "../../hooks/useTitleExtras";
import { tmdbPosterUri } from "../../hooks/useTmdbImage";
import { useSharedShimmer } from "../SkeletonLine";
import { useResolveSubjectLink } from "../../hooks/useSubjectLink";
import { artHeight, NO_RESULTS_ART, NO_RESULTS_RATIO } from "../NotFoundArt";
import { personSubject } from "../../utils/subjectLink";
import { CAST_SEARCH_DEBOUNCE_MS, CAST_SEARCH_MAX_LENGTH, MediaType } from "../../enums";
import type { CastMember } from "../../types";
import { colors, spacing, typography } from "../../theme";

/** Same feel as the app's other sheets: critically damped, no overshoot */
const SHEET_SPRING = { damping: 30, stiffness: 220, overshootClamping: true } as const;
const SNAP_SHARES = [0.6, 1];
const AVATAR = 52;
const ROW_H = AVATAR + spacing.md * 2;
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6];
const PHOTO_FADE_MS = 200;
/** The list settles in over its skeleton (and a search's results over the last ones) */
const LIST_FADE_MS = 180;
/** While a new search loads, the last results stay — dimmed, so it reads as "updating" */
const STALE_OPACITY = 0.45;
/** Nothing Found: Zoro's tallest (Search's size), and the gap between him and the message */
const ART_MAX_H = artHeight(NO_RESULTS_RATIO);
const ART_TEXT_GAP = spacing.sm;
/** Zoro climbs in from the sheet's bottom edge */
const ART_ENTER = FadeInDown.duration(350).delay(120);

interface Props {
	visible: boolean;
	onClose: () => void;
	tmdbId: number;
	mediaType: MediaType;
	title: string;
	/** Everyone in the cast (the header's count, whatever the search shows) */
	castTotal: number;
}

/** A show cast member's episode count (movies show none) */
function castStat(m: CastMember, mediaType: MediaType): string | null {
	if (mediaType !== MediaType.TV) return null;
	const n = m.episodes ?? 0;
	return `${n} ${n === 1 ? "episode" : "episodes"}`;
}

/**
 * The info page's View All cast: everyone, in list view (photo, name, part, a show's episode
 * count), a page at a time from the titleCastPage CF as the list nears its end. A search (name or
 * character) runs on the whole cast server-side, a quarter second after typing stops
 */
export default function CastSheet({
	visible,
	onClose,
	tmdbId,
	mediaType,
	title,
	castTotal,
}: Readonly<Props>) {
	const insets = useSafeAreaInsets();
	const sheetRef = useRef<GorhomSheet>(null);
	const { height } = useWindowDimensions();
	// Fixed heights: nothing (results, an empty search, the keyboard) changes them
	const snapPoints = useMemo(
		() => SNAP_SHARES.map((s) => Math.round((height - insets.top) * s)),
		[height, insets.top],
	);
	const animationConfigs = useBottomSheetSpringConfigs(SHEET_SPRING);
	const shimmer = useSharedShimmer();
	const resolveLink = useResolveSubjectLink();
	const [input, setInput] = useState("");
	const [query, setQuery] = useState("");
	useEffect(() => {
		const t = setTimeout(() => setQuery(input.trim()), CAST_SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(t);
	}, [input]);
	const { data, isPending, isPlaceholderData, fetchNextPage, hasNextPage, isFetchingNextPage } =
		useCastPages(tmdbId, mediaType, visible, query);
	const members = useMemo(() => data?.pages.flatMap((p) => p.members) ?? [], [data]);
	const [headerH, setHeaderH] = useState(0);
	// The keyboard lifts the sheet as far as full, and the sheet then counts itself at the full snap —
	// so its own restore left a half sheet full. It goes back to the snap it had before the keyboard
	const snapBeforeKeyboard = useRef(0);
	const keyboardUp = useRef(false);
	// The keyboard's height for Nothing Found (the sheet's own keyboard state stayed "shown" after that)
	const keyboardH = useSharedValue(0);
	useEffect(() => {
		const show = Keyboard.addListener("keyboardDidShow", (e) => {
			keyboardUp.current = true;
			keyboardH.set(e.endCoordinates.height);
		});
		const hide = Keyboard.addListener("keyboardDidHide", () => {
			keyboardUp.current = false;
			keyboardH.set(0);
			Keyboard.dismiss();
			sheetRef.current?.snapToIndex(snapBeforeKeyboard.current);
		});
		return () => {
			show.remove();
			hide.remove();
		};
	}, [keyboardH]);
	// Opening again starts from the whole cast
	const close = () => {
		setInput("");
		setQuery("");
		onClose();
	};
	const renderBackdrop = useCallback(
		(props: BottomSheetBackdropProps) => (
			<BottomSheetBackdrop
				{...props}
				appearsOnIndex={0}
				disappearsOnIndex={-1}
				opacity={0.6}
				pressBehavior="close"
			/>
		),
		[],
	);

	return (
		<Modal
			visible={visible}
			transparent
			animationType="none"
			statusBarTranslucent
			navigationBarTranslucent
			onRequestClose={() => sheetRef.current?.close()}
		>
			<GestureHandlerRootView style={styles.root}>
				<GorhomSheet
					ref={sheetRef}
					snapPoints={snapPoints}
					enableDynamicSizing={false}
					topInset={insets.top}
					enablePanDownToClose
					animationConfigs={animationConfigs}
					backdropComponent={renderBackdrop}
					backgroundStyle={styles.sheet}
					handleStyle={styles.handleArea}
					handleIndicatorStyle={styles.handle}
					// Typing a search: the sheet rides up above the keyboard (only shortened when it
					// wouldn't fit over it) and gives the height back after — results never resize it
					keyboardBehavior="interactive"
					keyboardBlurBehavior="restore"
					onChange={(index) => {
						if (index >= 0 && !keyboardUp.current) snapBeforeKeyboard.current = index;
					}}
					onClose={close}
				>
					<View style={styles.header} onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
						<Text style={styles.title}>Cast</Text>
						<Text style={styles.subtitle} numberOfLines={1}>
							{`${title} · ${castTotal} ${castTotal === 1 ? "person" : "people"}`}
						</Text>
						<View style={styles.search}>
							<Ionicons name="search" size={16} color={colors.textMuted} />
							<BottomSheetTextInput
								value={input}
								onChangeText={setInput}
								placeholder="Search by name or character"
								maxLength={CAST_SEARCH_MAX_LENGTH}
								placeholderTextColor={colors.textMuted}
								style={styles.searchInput}
								autoCorrect={false}
								autoCapitalize="none"
								returnKeyType="search"
								accessibilityLabel="Search the cast"
							/>
							{input ? (
								<Pressable onPress={() => setInput("")} hitSlop={10} accessibilityLabel="Clear search">
									<Ionicons name="close-circle" size={18} color={colors.textMuted} />
								</Pressable>
							) : null}
						</View>
					</View>
					{isPending ? (
						<View style={styles.list}>
							{SKELETON_ROWS.map((i) => (
								<View key={i} style={styles.row}>
									<Animated.View style={[styles.avatar, styles.skeleton, { opacity: shimmer }]} />
									<View style={styles.rowText}>
										<Animated.View style={[styles.skeletonLine, { opacity: shimmer }]} />
										<Animated.View
											style={[styles.skeletonLine, styles.skeletonShort, { opacity: shimmer }]}
										/>
									</View>
								</View>
							))}
						</View>
					) : members.length === 0 ? (
						<NothingFound query={query} headerH={headerH} keyboardH={keyboardH} />
					) : (
						<BottomSheetFlatList
							key={query}
							style={isPlaceholderData && styles.stale}
							// A row tap while the keyboard is up lands the first time (not just closing it)
							keyboardShouldPersistTaps="handled"
							keyboardDismissMode="on-drag"
							data={members}
							keyExtractor={(m: CastMember) => String(m.id)}
							contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.lg }]}
							getItemLayout={(_: unknown, index: number) => ({
								length: ROW_H,
								offset: ROW_H * index,
								index,
							})}
							onEndReached={() => {
								if (hasNextPage && !isFetchingNextPage) fetchNextPage();
							}}
							onEndReachedThreshold={0.5}
							ListFooterComponent={
								isFetchingNextPage ? (
									<ActivityIndicator style={styles.more} color={colors.primary} />
								) : null
							}
							renderItem={({ item }: { item: CastMember }) => (
								<View
									style={styles.row}
									accessible
									accessibilityLabel={[
										item.name,
										item.character && `as ${item.character}`,
										castStat(item, mediaType),
									]
										.filter(Boolean)
										.join(", ")}
								>
									<View style={styles.avatar}>
										{item.profile ? (
											<Image
												source={{ uri: tmdbPosterUri(item.profile, AVATAR) }}
												style={styles.avatarPhoto}
												contentFit="cover"
												transition={PHOTO_FADE_MS}
												recyclingKey={String(item.id)}
											/>
										) : (
											<Ionicons name="person" size={24} color={colors.textMuted} />
										)}
									</View>
									<View style={styles.rowText}>
										<Text style={styles.name} numberOfLines={1}>
											{item.name}
										</Text>
										{item.character ? (
											<Text style={styles.character} numberOfLines={1}>
												{item.character}
											</Text>
										) : null}
									</View>
									<View style={styles.rowEnd}>
										{castStat(item, mediaType) && (
											<Text style={styles.stat}>{castStat(item, mediaType)}</Text>
										)}
										<Pressable
											hitSlop={10}
											onPress={() => {
												resolveLink(personSubject(item, { tmdbId, mediaType }))
													.then((url) => Linking.openURL(url))
													.catch(() => {});
											}}
											accessibilityRole="link"
											accessibilityLabel={`${item.name}, view on IMDb`}
										>
											<Text style={styles.imdbLink}>IMDb</Text>
										</Pressable>
									</View>
								</View>
							)}
						/>
					)}
				</GorhomSheet>
			</GestureHandlerRootView>
		</Modal>
	);
}

/**
 * Search's Nothing Found: Zoro standing on the sheet's visible bottom edge — the screen's, or the
 * keyboard's top while it's up — sized to the room under the header, the message just over his
 * head. Placed on the UI thread from the sheet's live position, so he stays put through a drag
 */
function NothingFound({
	query,
	headerH,
	keyboardH,
}: Readonly<{ query: string; headerH: number; keyboardH: SharedValue<number> }>) {
	const { animatedPosition, animatedLayoutState } = useBottomSheetInternal();
	const messageH = useSharedValue(0);
	const emptyH = useSharedValue(0);
	const layout = useAnimatedStyle(() => {
		const { containerHeight, handleHeight } = animatedLayoutState.get();
		const top = animatedPosition.get() + Math.max(0, handleHeight) + headerH;
		const visibleBottom = containerHeight - keyboardH.get();
		// This view runs past the visible edge (under the keyboard / below the screen at a lower snap)
		const below = Math.max(0, top + emptyH.get() - visibleBottom);
		const room = visibleBottom - top;
		const artH = Math.max(0, Math.min(ART_MAX_H, room - messageH.get() - ART_TEXT_GAP - spacing.lg));
		return { bottom: below, height: artH + ART_TEXT_GAP + messageH.get() };
	});
	return (
		<View style={styles.empty} onLayout={(e) => emptyH.set(e.nativeEvent.layout.height)}>
			<Reanimated.View style={[styles.emptyStage, layout]}>
				<Reanimated.View
					entering={FadeIn.duration(LIST_FADE_MS)}
					style={styles.emptyText}
					onLayout={(e) => messageH.set(e.nativeEvent.layout.height)}
				>
					<Text style={styles.emptyTitle}>NOTHING FOUND</Text>
					<Text style={styles.emptyHint}>
						Searched the whole cast for "{query}", but nothing happened. Have you lost the way?
					</Text>
				</Reanimated.View>
				<Reanimated.Image
					entering={ART_ENTER}
					source={NO_RESULTS_ART}
					resizeMode="contain"
					style={styles.emptyArt}
					accessibilityIgnoresInvertColors
				/>
			</Reanimated.View>
		</View>
	);
}

const styles = StyleSheet.create({
	root: { flex: 1 },
	sheet: { backgroundColor: colors.surface, borderRadius: 20 },
	handleArea: { paddingVertical: 10 },
	handle: { width: 36, height: 4, backgroundColor: colors.textMuted },
	search: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginTop: spacing.md,
		paddingHorizontal: spacing.md,
		height: 40,
		borderRadius: 12,
		backgroundColor: colors.surfaceLight,
	},
	searchInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 0 },
	stale: { opacity: STALE_OPACITY },
	empty: { flex: 1 },
	// Message over Zoro, the stack's foot on the visible edge
	emptyStage: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: ART_TEXT_GAP },
	emptyText: {
		alignItems: "center",
		paddingHorizontal: spacing.xxl,
		gap: spacing.xs,
	},
	// Fills what the message leaves; contain keeps Zoro's shape, centred
	emptyArt: { flex: 1, aspectRatio: NO_RESULTS_RATIO },
	// Search's empty-results type
	emptyTitle: { ...typography.subtitle, color: colors.textSecondary, textAlign: "center" },
	emptyHint: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
	header: {
		paddingHorizontal: spacing.lg,
		paddingBottom: spacing.md,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: colors.border,
	},
	title: { ...typography.title, fontSize: 20 },
	subtitle: { ...typography.caption, marginTop: 2 },
	list: { paddingHorizontal: spacing.lg },
	row: { height: ROW_H, flexDirection: "row", alignItems: "center", gap: spacing.md },
	avatar: {
		width: AVATAR,
		height: AVATAR,
		borderRadius: AVATAR / 2,
		overflow: "hidden",
		backgroundColor: colors.surfaceLight,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarPhoto: { width: AVATAR, height: AVATAR },
	rowText: { flex: 1, gap: 2 },
	name: { ...typography.body, fontWeight: "600", color: colors.text },
	character: { ...typography.caption, color: colors.textSecondary },
	rowEnd: { alignItems: "flex-end", gap: 2 },
	stat: { ...typography.caption, color: colors.textMuted, fontVariant: ["tabular-nums"] },
	imdbLink: { ...typography.caption, fontWeight: "600", color: colors.primary },
	skeleton: { backgroundColor: colors.border },
	skeletonLine: { height: 10, width: "60%", borderRadius: 4, backgroundColor: colors.border },
	skeletonShort: { width: "35%", marginTop: 6 },
	more: { marginVertical: spacing.lg },
});
