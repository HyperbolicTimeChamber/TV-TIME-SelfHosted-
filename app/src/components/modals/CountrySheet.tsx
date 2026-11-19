import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Animated,
	Keyboard,
	Modal,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
// Gesture-handler Pressable: inside the sheet, React Native's lost taps to the sheet's gestures
import { GestureHandlerRootView, Pressable } from "react-native-gesture-handler";
import { useSharedValue } from "react-native-reanimated";
import GorhomSheet, {
	BottomSheetBackdrop,
	BottomSheetFlatList,
	BottomSheetScrollView,
	BottomSheetTextInput,
	useBottomSheetSpringConfigs,
	type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRegionProviders, useStoredRegions } from "../../hooks/useRegionProviders";
import { tmdbPosterUri } from "../../hooks/useTmdbImage";
import { useSharedShimmer } from "../SkeletonLine";
import { NothingFound } from "./CastSheet";
import { displayProviders, shortProviderName } from "../../utils/providerNames";
import { requireOnline } from "../../utils/requireOnline";
import {
	buildRegionList,
	regionFlag,
	regionName,
	type RegionEntry,
} from "../../utils/watchRegions";
import { COUNTRY_SEARCH_MAX_LENGTH, PROVIDER_OPEN_GUARD_MS, type MediaType } from "../../enums";
import { colors, spacing, typography, themedStyles } from "../../theme";

const HIGH_SEAS_ART = require("../../../assets/high-seas.webp");
const HIGH_SEAS_RATIO = 240 / 253;

/** Same feel as the app's other sheets: critically damped, no overshoot */
const SHEET_SPRING = { damping: 30, stiffness: 220, overshootClamping: true } as const;
const SNAP_SHARES = [0.6, 1];
const ROW_H = 52;
const LOGO = 36;
const SKELETON_ROWS = [0, 1, 2, 3, 4];
/** When a service was last opened here: a double tap opens one */
let lastOpenAt = 0;

interface Props {
	visible: boolean;
	onClose: () => void;
	tmdbId: number;
	mediaType: MediaType;
	/** The viewer's country: left out of the list (the footer row shows it) */
	currentRegion: string | undefined;
	/** Opens a service; `link` is TMDB's watch page for the picked country */
	onOpen: (name: string, link: string | null) => void;
}

/**
 * Where to Watch "Other Countries": a search + every country (the ones whose services are already
 * stored first); tapping one shows that country's services in the sheet (skeleton while they
 * load, "Not Available to Stream" when none), the back arrow returns to the list. Fixed snap
 * heights — results, the detail and the keyboard never resize it (docs/claude/ui-misc.md Sheet
 * checks). Web: components/CountrySheet
 */
export default function CountrySheet({
	visible,
	onClose,
	tmdbId,
	mediaType,
	currentRegion,
	onOpen,
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
	const [input, setInput] = useState("");
	const [selected, setSelected] = useState<string | null>(null);
	const stored = useStoredRegions(tmdbId, mediaType, visible, selected);
	const storedSet = useMemo(() => new Set(stored), [stored]);
	const list = useMemo(
		() => buildRegionList(stored, input, currentRegion),
		[stored, input, currentRegion],
	);
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
	// Opening again starts from the whole list
	const close = () => {
		setInput("");
		setSelected(null);
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
	const pick = (entry: RegionEntry) => {
		// A second tap before the detail shows does nothing
		if (selected) return;
		// Only a country not on the phone yet calls the server
		if (!storedSet.has(entry.code) && !requireOnline()) return;
		Haptics.selectionAsync().catch(() => {});
		Keyboard.dismiss();
		setSelected(entry.code);
	};

	return (
		<Modal
			visible={visible}
			transparent
			animationType="none"
			statusBarTranslucent
			navigationBarTranslucent
			// Back key: the detail steps back to the list first, then the sheet closes
			onRequestClose={() => (selected ? setSelected(null) : sheetRef.current?.close())}
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
					{selected ? (
						<RegionDetail
							region={selected}
							tmdbId={tmdbId}
							mediaType={mediaType}
							onBack={() => setSelected(null)}
							onOpen={onOpen}
							bottomInset={insets.bottom}
						/>
					) : (
						<>
							<View style={styles.header} onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
								<Text style={styles.title}>Other Countries</Text>
								<View style={styles.search}>
									<Ionicons name="search" size={16} color={colors.textMuted} />
									<BottomSheetTextInput
										value={input}
										onChangeText={setInput}
										placeholder="Search countries"
										maxLength={COUNTRY_SEARCH_MAX_LENGTH}
										placeholderTextColor={colors.textMuted}
										style={styles.searchInput}
										autoCorrect={false}
										autoCapitalize="none"
										returnKeyType="search"
										accessibilityLabel="Search countries"
									/>
									{input ? (
										<Pressable
											onPress={() => setInput("")}
											hitSlop={10}
											accessibilityLabel="Clear search"
										>
											<Ionicons name="close-circle" size={18} color={colors.textMuted} />
										</Pressable>
									) : null}
								</View>
							</View>
							{list.length === 0 ? (
								<NothingFound
									hint={`Looked through every country for "${input.trim()}", but found none. Have you lost the way?`}
									headerH={headerH}
									keyboardH={keyboardH}
								/>
							) : (
								<BottomSheetFlatList
									// A tap while the keyboard is up lands the first time (not just closing it)
									keyboardShouldPersistTaps="handled"
									keyboardDismissMode="on-drag"
									data={list}
									keyExtractor={(e: RegionEntry) => e.code}
									contentContainerStyle={[
										styles.list,
										{ paddingBottom: insets.bottom + spacing.lg },
									]}
									getItemLayout={(_: unknown, index: number) => ({
										length: ROW_H,
										offset: ROW_H * index,
										index,
									})}
									renderItem={({ item }: { item: RegionEntry }) => (
										<Pressable
											onPress={() => pick(item)}
											accessibilityRole="button"
											accessibilityLabel={`${item.name}, show where to watch`}
											style={styles.row}
										>
											<Text style={styles.flag}>{item.flag}</Text>
											<Text style={styles.name} numberOfLines={1}>
												{item.name}
											</Text>
											<Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
										</Pressable>
									)}
								/>
							)}
						</>
					)}
				</GorhomSheet>
			</GestureHandlerRootView>
		</Modal>
	);
}

/** One country's services in the sheet: back arrow, its name, then skeleton / services / none */
function RegionDetail({
	region,
	tmdbId,
	mediaType,
	onBack,
	onOpen,
	bottomInset,
}: Readonly<{
	region: string;
	tmdbId: number;
	mediaType: MediaType;
	onBack: () => void;
	onOpen: (name: string, link: string | null) => void;
	bottomInset: number;
}>) {
	const { data, isPending, isError } = useRegionProviders(tmdbId, mediaType, region);
	const shimmer = useSharedShimmer();
	const shown = data ? displayProviders(data.providers) : [];
	const name = regionName(region);

	return (
		<>
			<View style={styles.header}>
				<View style={styles.detailHead}>
					<Pressable
						onPress={onBack}
						hitSlop={12}
						accessibilityRole="button"
						accessibilityLabel="Back to countries"
						style={styles.back}
					>
						<Ionicons name="chevron-back" size={22} color={colors.text} />
					</Pressable>
					<Text style={[styles.title, styles.detailTitle]} numberOfLines={1}>
						{`${regionFlag(region)} ${name}`}
					</Text>
					{shown.length > 0 && <Text style={styles.credit}>via JustWatch</Text>}
				</View>
			</View>
			<BottomSheetScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={[styles.list, { paddingBottom: bottomInset + spacing.lg }]}
			>
				{isPending ? (
					<View accessibilityLabel="Loading where to watch">
						{SKELETON_ROWS.map((i) => (
							<View key={i} style={styles.row}>
								<Animated.View style={[styles.logo, styles.skeleton, { opacity: shimmer }]} />
								<Animated.View style={[styles.skeletonLine, { opacity: shimmer }]} />
							</View>
						))}
					</View>
				) : isError || !data ? (
					<View style={styles.note}>
						<Text style={styles.noteTitle}>Couldn't Load Streaming Services</Text>
						<Text style={styles.noteHint}>Go back and pick the country again to retry.</Text>
					</View>
				) : shown.length === 0 ? (
					<View style={styles.empty}>
						<Image
							source={HIGH_SEAS_ART}
							style={styles.emptyArt}
							contentFit="contain"
							accessibilityIgnoresInvertColors
						/>
						<View style={styles.emptyText}>
							<Text style={styles.noteTitle}>Not Available to Stream</Text>
						</View>
					</View>
				) : (
					shown.map((p) => (
						<Pressable
							key={p.id}
							onPress={() => {
								const now = Date.now();
								if (now - lastOpenAt < PROVIDER_OPEN_GUARD_MS) return;
								lastOpenAt = now;
								Haptics.selectionAsync().catch(() => {});
								onOpen(p.name, data.link);
							}}
							accessibilityRole="link"
							accessibilityLabel={`Watch on ${p.name}`}
							style={styles.row}
						>
							<Image
								source={{ uri: tmdbPosterUri(p.logo, 40) }}
								style={styles.logo}
								contentFit="cover"
							/>
							<Text style={styles.name} numberOfLines={1}>
								{shortProviderName(p.name)}
							</Text>
						</Pressable>
					))
				)}
			</BottomSheetScrollView>
		</>
	);
}

const styles = themedStyles(() =>
	StyleSheet.create({
		root: { flex: 1 },
		sheet: { backgroundColor: colors.surface, borderRadius: 20 },
		handleArea: { paddingVertical: 10 },
		handle: { width: 36, height: 4, backgroundColor: colors.textMuted },
		header: {
			paddingHorizontal: spacing.lg,
			paddingBottom: spacing.md,
			borderBottomWidth: StyleSheet.hairlineWidth,
			borderBottomColor: colors.border,
		},
		title: { ...typography.title, fontSize: 20 },
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
		list: { paddingHorizontal: spacing.lg },
		row: { height: ROW_H, flexDirection: "row", alignItems: "center", gap: spacing.md },
		flag: { fontSize: 22, width: 32, textAlign: "center" },
		name: { ...typography.body, fontSize: 15, flex: 1, color: colors.text },
		detailHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
		back: { marginLeft: -spacing.xs },
		detailTitle: { flex: 1 },
		credit: { ...typography.caption, fontSize: 11, color: colors.textMuted },
		logo: { width: LOGO, height: LOGO, borderRadius: LOGO / 2 },
		skeleton: { backgroundColor: colors.border },
		skeletonLine: { height: 10, width: "40%", borderRadius: 4, backgroundColor: colors.border },
		note: { paddingVertical: spacing.lg, gap: 2 },
		noteTitle: { ...typography.body, fontWeight: "600", color: colors.text },
		noteHint: { ...typography.caption, color: colors.textMuted },
		empty: {
			flexDirection: "row",
			alignItems: "center",
			gap: spacing.md,
			marginTop: spacing.lg,
			backgroundColor: colors.surfaceLight,
			borderRadius: 14,
			paddingVertical: spacing.md,
			paddingHorizontal: spacing.lg,
		},
		emptyArt: { width: 44, height: 44 / HIGH_SEAS_RATIO },
		emptyText: { flex: 1, gap: 2 },
	}),
);
