import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WhereToWatchCompact, WhereToWatchPlacement } from "./WhereToWatch";
import { formatIsoDate } from "../utils/format";
import {
	View,
	Text,
	TouchableOpacity,
	Animated,
	StyleSheet,
	Modal,
	ActivityIndicator,
	Dimensions,
} from "react-native";
// Buttons inside the gorhom sheet: gesture-handler's Pressable (React Native's touchables dropped a
// tap whose finger drifted a pixel or two inside the sheet)
import { GestureHandlerRootView, Pressable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { SheetGroup, SheetOption } from "./modals/BottomSheet";
import SkeletonLine, { useSharedShimmer } from "./SkeletonLine";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, typography } from "../theme";
import { tmdbBackdropUri, tmdbLogoUri, tmdbPosterUri } from "../hooks/useTmdbImage";
import { useTitleLogo } from "../hooks/useTitleLogo";
import { useCustomLists } from "../hooks/useCustomLists";
import { useAuthStore } from "../stores";
import { isTitleListed } from "../utils";
import AddToListSheet from "./modals/AddToListSheet";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;

import type { ShowDrawerData } from "../types/showDrawer";

export type { ShowDrawerData };

/** An extra row under "Go to Show" (the list page's Add to another list / Remove / Export) */
export interface ShowDrawerAction {
	key: string;
	label: string;
	icon: React.ComponentProps<typeof Ionicons>["name"];
	/** Second line under the label */
	hint?: string;
	destructive?: boolean;
	onPress: () => void;
}

interface Props {
	visible: boolean;
	show: ShowDrawerData | null;
	loading?: boolean;
	onGoToShow?: () => void;
	/** Extra rows under the Go to button */
	actions?: ShowDrawerAction[];
	onClose: () => void;
}

/** Wait this long for the logo before showing the name — the name flashing in, then swapping for
 *  the logo, read as a glitch (as in the sheets) */
const NAME_DELAY_MS = 2000;
const LOGO_HEIGHT = 56;
const LOGO_MAX_W = 260;

/** The title's logo, its name when TMDB has none (or after NAME_DELAY_MS still loading), in a fixed
 *  slot so the drawer doesn't resize. Keyed per title: the wait restarts for each one */
function DrawerTitle({ show }: { show: ShowDrawerData }) {
	const logoPath = useTitleLogo(undefined, show.tmdbId, show.mediaType);
	const [waited, setWaited] = useState(false);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		const t = setTimeout(() => setWaited(true), NAME_DELAY_MS);
		return () => clearTimeout(t);
	}, []);
	const showLogo = !!logoPath && !failed;
	const showName = logoPath === null || failed || (!logoPath && waited);
	return (
		<View style={styles.titleSlot}>
			{showLogo ? (
				<Image
					source={{ uri: tmdbLogoUri(logoPath, LOGO_MAX_W) }}
					style={styles.titleLogo}
					contentFit="contain"
					contentPosition="left center"
					transition={200}
					onError={() => setFailed(true)}
					accessibilityLabel={show.title}
				/>
			) : showName ? (
				<Text style={styles.title} numberOfLines={2}>
					{show.title}
				</Text>
			) : null}
		</View>
	);
}

export default function ShowDrawer({
	visible,
	show,
	loading,
	onGoToShow,
	actions,
	onClose,
}: Readonly<Props>) {
	const bottomSheetRef = useRef<BottomSheet>(null);
	const insets = useSafeAreaInsets();
	const shimmer = useSharedShimmer();
	const maxHeight = SCREEN_HEIGHT * 0.85;
	const [imageLoaded, setImageLoaded] = useState(false);
	// "Add to List": needs to know which title this is, and a signed-in user to own the list
	const userId = useAuthStore((s) => s.user?.uid);
	const { lists } = useCustomLists(userId);
	const [listSheetOpen, setListSheetOpen] = useState(false);
	const listEntry = useMemo(
		() =>
			show?.tmdbId && show.mediaType
				? {
						tmdbId: show.tmdbId,
						mediaType: show.mediaType,
						title: show.title,
						posterPath: show.posterPath,
					}
				: null,
		[show?.tmdbId, show?.mediaType, show?.title, show?.posterPath],
	);
	const isListed = !!listEntry && isTitleListed(lists, listEntry.tmdbId, listEntry.mediaType);

	const handleSheetChanges = useCallback(
		(index: number) => {
			if (index === -1) onClose();
		},
		[onClose],
	);

	if (!visible) return null;

	const metaParts: string[] = [];
	// A movie's full release date ("16 Jul 2024"); a show's first-air year
	if (show?.releaseDate) metaParts.push(formatIsoDate(show.releaseDate));
	else if (show?.year) metaParts.push(show.year);
	if (show?.totalSeasons)
		metaParts.push(`${show.totalSeasons} season${show.totalSeasons !== 1 ? "s" : ""}`);
	if (show?.totalEpisodes) metaParts.push(`${show.totalEpisodes} episodes`);
	if (show?.runtime) metaParts.push(`${show.runtime} min`);
	const metaLine = metaParts.join(" \u00b7 ");

	return (
		<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
			<GestureHandlerRootView style={styles.overlay}>
				<TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
				<BottomSheet
					ref={bottomSheetRef}
					index={0}
					enableDynamicSizing
					maxDynamicContentSize={maxHeight}
					onChange={handleSheetChanges}
					enablePanDownToClose
					animateOnMount
					backgroundStyle={styles.background}
					handleIndicatorStyle={styles.handleIndicator}
					handleStyle={styles.handleContainer}
				>
					{loading ? (
						<View style={styles.loadingContainer}>
							<ActivityIndicator size="large" color={colors.primary} />
						</View>
					) : show ? (
						<BottomSheetScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
							<View style={styles.imageContainer}>
								{!imageLoaded && (
									<Animated.View style={[styles.imageSkeleton, { opacity: shimmer }]} />
								)}
								<Image
									source={
										show.backdropPath
											? { uri: tmdbBackdropUri(show.backdropPath, SCREEN_WIDTH) }
											: show.posterPath
												? { uri: tmdbPosterUri(show.posterPath, SCREEN_WIDTH) }
												: undefined
									}
									style={styles.backdropImage}
									contentFit="cover"
									transition={300}
									onLoad={() => setImageLoaded(true)}
								/>
								<LinearGradient
									colors={["transparent", colors.background]}
									style={styles.imageGradient}
								/>
								{/* With list actions below ("Add to another list"), the corner button would say it twice */}
								{userId && listEntry && !actions?.length ? (
									<Pressable
										style={({ pressed }) => [
											styles.listButton,
											isListed && styles.listButtonActive,
											pressed && styles.pressed,
										]}
										onPress={() => setListSheetOpen(true)}
										hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
										accessibilityLabel="Add to List"
									>
										<Ionicons
											name={isListed ? "bookmark" : "bookmark-outline"}
											size={20}
											color={colors.text}
										/>
									</Pressable>
								) : null}
							</View>
							<View style={styles.content}>
								<DrawerTitle key={`${show.mediaType}_${show.tmdbId}`} show={show} />
								{metaLine ? <Text style={styles.meta}>{metaLine}</Text> : null}
								<View style={styles.genreRow}>
									{show.genres == null ? (
										<SkeletonLine width="45%" height={11} style={{ marginTop: spacing.xs }} />
									) : show.genres ? (
										<Text style={[styles.meta, { flex: 1 }]}>{show.genres}</Text>
									) : null}
									{show.mediaType && (
										<View
											style={[
												styles.typeBadge,
												show.mediaType === "movie" && styles.typeBadgeMovie,
											]}
										>
											<Text style={styles.typeBadgeText}>
												{show.mediaType === "movie" ? "MOVIE" : "TV"}
											</Text>
										</View>
									)}
								</View>
								{show.overview === null ? (
									<View style={styles.overviewSkeleton}>
										<SkeletonLine width="100%" height={14} />
										<SkeletonLine width="95%" height={14} style={{ marginTop: spacing.xs }} />
										<SkeletonLine width="60%" height={14} style={{ marginTop: spacing.xs }} />
									</View>
								) : show.overview ? (
									<Text style={styles.overview}>{show.overview}</Text>
								) : null}
								{/* The info page's Where to Watch, fitted to the drawer (nothing when none) */}
								{show.tmdbId != null && show.mediaType ? (
									<WhereToWatchCompact
										tmdbId={show.tmdbId}
										mediaType={show.mediaType}
										title={show.title}
										placement={WhereToWatchPlacement.DRAWER}
									/>
								) : null}
							</View>
							{onGoToShow && (
								<Pressable
									style={({ pressed }) => [
										styles.goToShowButton,
										// Last thing in the drawer → clear of the nav bar; actions follow → they take that
										actions?.length
											? { marginBottom: spacing.lg }
											: { marginBottom: Math.max(spacing.xl, insets.bottom + 8) },
										pressed && styles.pressed,
									]}
									onPress={onGoToShow}
								>
									<Text style={styles.goToShowText}>
										{show.mediaType === "movie" ? "Go to Movie" : "Go to Show"}
									</Text>
								</Pressable>
							)}
							{actions?.length ? (
								// The app's sheet style: everyday actions in one card, destructive ones in their own
								<View style={[styles.actions, { paddingBottom: insets.bottom + spacing.xl }]}>
									{[actions.filter((a) => !a.destructive), actions.filter((a) => a.destructive)]
										.filter((group) => group.length > 0)
										.map((group, i) => (
											<View key={i} style={i > 0 && styles.actionGap}>
												<SheetGroup>
													{group.map((action) => (
														<SheetOption
															key={action.key}
															icon={action.icon}
															color={action.destructive ? colors.destructiveRed : colors.accent}
															title={action.label}
															hint={action.hint}
															destructive={action.destructive}
															onPress={action.onPress}
														/>
													))}
												</SheetGroup>
											</View>
										))}
								</View>
							) : null}
						</BottomSheetScrollView>
					) : null}
				</BottomSheet>
				{/* Inside this Modal, so it stacks on top of the drawer (a second top-level modal would not on iOS) */}
				<AddToListSheet
					entry={listSheetOpen ? listEntry : null}
					onClose={() => setListSheetOpen(false)}
				/>
			</GestureHandlerRootView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
	},
	backdrop: {
		...(StyleSheet.absoluteFill as object),
		backgroundColor: colors.overlayMedium,
	},
	background: {
		backgroundColor: colors.background,
	},
	handleContainer: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		zIndex: 1,
		paddingVertical: spacing.sm,
	},
	handleIndicator: {
		backgroundColor: "rgba(255, 255, 255, 0.6)",
		width: 40,
	},
	loadingContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: spacing.xxl,
	},
	scroll: {
		flexGrow: 0,
		flexShrink: 1,
	},
	imageContainer: {
		height: 200,
		borderTopLeftRadius: 16,
		borderTopRightRadius: 16,
		overflow: "hidden",
	},
	imageSkeleton: {
		...(StyleSheet.absoluteFill as object),
		backgroundColor: colors.surfaceLight,
	},
	backdropImage: {
		width: "100%",
		height: "100%",
	},
	imageGradient: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		height: 140,
	},
	content: {
		padding: spacing.lg,
		marginTop: -60,
	},
	title: {
		...typography.title,
		fontSize: 22,
	},
	titleSlot: { minHeight: LOGO_HEIGHT, justifyContent: "center", marginBottom: spacing.xs },
	titleLogo: { height: LOGO_HEIGHT, width: LOGO_MAX_W, maxWidth: "100%" },
	genreRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginTop: spacing.xs,
	},
	typeBadge: {
		backgroundColor: colors.primary,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		borderRadius: 4,
		flexShrink: 0,
	},
	typeBadgeMovie: {
		backgroundColor: colors.moviePurple,
	},
	typeBadgeText: {
		fontSize: 10,
		fontWeight: "700",
		color: colors.text,
		letterSpacing: 0.5,
	},
	meta: {
		...typography.caption,
		color: colors.text,
		marginTop: spacing.xs,
	},
	overviewSkeleton: {
		marginTop: spacing.md,
	},
	overview: {
		...typography.body,
		color: colors.textSecondary,
		marginTop: spacing.md,
		lineHeight: 22,
	},
	pressed: { opacity: 0.7 },
	goToShowButton: {
		alignItems: "center",
		paddingVertical: spacing.md,
		marginHorizontal: spacing.lg,
		marginBottom: spacing.xl,
		borderRadius: 8,
		backgroundColor: colors.primary,
	},
	goToShowText: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.text,
	},
	// Over the backdrop's top-right corner, below the sheet's grab handle
	listButton: {
		position: "absolute",
		top: spacing.xl,
		right: spacing.md,
		width: 36,
		height: 36,
		borderRadius: 18,
		borderWidth: 2,
		borderColor: colors.text,
		backgroundColor: colors.badgeOverlay,
		justifyContent: "center",
		alignItems: "center",
	},
	listButtonActive: {
		backgroundColor: colors.warningAmber,
		borderColor: colors.warningAmber,
	},
	actions: { marginHorizontal: spacing.lg },
	actionGap: { marginTop: spacing.md },
});
