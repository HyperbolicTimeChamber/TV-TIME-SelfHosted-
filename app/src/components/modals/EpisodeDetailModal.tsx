import { memo, useState, useRef, useEffect, useCallback } from "react";
import {
	View,
	Text,
	ScrollView,
	FlatList,
	TouchableOpacity,
	Pressable,
	Animated,
	Modal,
	StyleSheet,
	ActivityIndicator,
	Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import AnimatedModal from "./AnimatedModal";

import { useSharedShimmer } from "../SkeletonLine";
import { colors, spacing, typography } from "../../theme";
import { tmdbStillUri, tmdbBackdropUri, tmdbPosterUri } from "../../hooks/useTmdbImage";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = SCREEN_WIDTH * 0.7;
const CARD_GAP = 12;
const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP;
const SIDE_PADDING = (SCREEN_WIDTH - CARD_WIDTH) / 2;
const CARD_HEIGHT = Math.min(Dimensions.get("window").height * 0.55, 460);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDate(dateStr: string): string {
	const [y, m, d] = dateStr.split("-");
	return `${Number.parseInt(d, 10)} ${MONTHS[Number.parseInt(m, 10) - 1]} ${y}`;
}

function epKey(s: number, e: number): string {
	return `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`;
}

export interface CarouselEpisode {
	season: number;
	episode: number;
	title: string | null;
	airDate: string | null;
	runtime: number | null;
	stillPath: string | null;
	overview: string | null;
}

interface Props {
	visible: boolean;
	tmdbId: number;
	showTitle: string;
	showPosterPath: string | null;
	showBackdropPath: string | null;
	episodes: CarouselEpisode[];
	initialIndex: number;
	watchedKeys: Map<string, number>;
	currentNextEpisode: { season: number; episode: number } | null;
	onMarkWatched: (tmdbId: number, season: number, episode: number) => Promise<void>;
	onMarkWatchedThrough: (tmdbId: number, season: number, episode: number) => Promise<void>;
	onUnmarkWatched: (tmdbId: number, season: number, episode: number) => Promise<void>;
	onShowPress?: () => void;
	onClose: () => void;
	onLoadEpisodeDetails?: (season: number) => Promise<CarouselEpisode[] | null>;
}

// ---------------------------------------------------------------------------
// EpisodeCard
// ---------------------------------------------------------------------------

const EpisodeCard = memo(function EpisodeCard({
	ep,
	showTitle,
	showPosterPath,
	showBackdropPath,
	isWatched,
	watchCount,
	isLoaded,
	isMarking,
	onMarkWatched,
	onUnwatch,
	onRewatch,
	onShowPress,
}: {
	ep: CarouselEpisode;
	showTitle: string;
	showPosterPath: string | null;
	showBackdropPath: string | null;
	isWatched: boolean;
	watchCount: number;
	isLoaded: boolean;
	isMarking: boolean;
	onMarkWatched: () => void;
	onUnwatch: () => void;
	onRewatch: () => void;
	onShowPress?: () => void;
}) {
	const shimmer = useSharedShimmer();
	const [imageLoaded, setImageLoaded] = useState(false);
	const label = `S${String(ep.season).padStart(2, "0")} | E${String(ep.episode).padStart(2, "0")}`;

	if (!isLoaded) {
		return (
			<View style={styles.cardContent}>
				<Animated.View
					style={[styles.imageContainer, { opacity: shimmer, backgroundColor: colors.surfaceLight }]}
				/>
				<View style={styles.skeletonBody}>
					<Animated.View style={[styles.skeletonTitle, { opacity: shimmer }]} />
					<Animated.View style={[styles.skeletonLine, { opacity: shimmer }]} />
					<Animated.View style={[styles.skeletonLineShort, { opacity: shimmer }]} />
				</View>
			</View>
		);
	}

	return (
		<View style={styles.cardContent}>
			{/* Image section */}
			<View style={styles.imageContainer}>
				{!imageLoaded && <Animated.View style={[styles.imageSkeleton, { opacity: shimmer }]} />}
				{ep.stillPath ? (
					<Image
						source={{ uri: tmdbStillUri(ep.stillPath, CARD_WIDTH) }}
						style={styles.still}
						contentFit="cover"
						transition={300}
						onLoad={() => setImageLoaded(true)}
					/>
				) : showBackdropPath ? (
					<Image
						source={{ uri: tmdbBackdropUri(showBackdropPath, CARD_WIDTH) }}
						style={styles.still}
						contentFit="cover"
						transition={300}
						onLoad={() => setImageLoaded(true)}
					/>
				) : showPosterPath ? (
					<Image
						source={{ uri: tmdbPosterUri(showPosterPath, CARD_WIDTH) }}
						style={styles.still}
						contentFit="cover"
						transition={300}
						onLoad={() => setImageLoaded(true)}
					/>
				) : (
					<View style={styles.stillPlaceholder}>
						<Text style={styles.stillPlaceholderText}>E{String(ep.episode).padStart(2, "0")}</Text>
					</View>
				)}
				<LinearGradient colors={["transparent", colors.surface]} style={styles.imageGradient} />
			</View>

			<ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
				<TouchableOpacity style={styles.titlePill} onPress={onShowPress} disabled={!onShowPress}>
					<Text style={styles.titlePillText} numberOfLines={1}>
						{showTitle.toUpperCase()}
					</Text>
					{onShowPress && <Text style={styles.titlePillArrowText}>›</Text>}
				</TouchableOpacity>
				{ep.title ? <Text style={styles.episodeTitle}>{ep.title}</Text> : null}
				<Text style={styles.label}>{label}</Text>
				<View style={styles.metaRow}>
					{ep.airDate ? <Text style={styles.meta}>{formatDate(ep.airDate)}</Text> : null}
					{ep.runtime ? (
						<Text style={styles.meta}>
							{ep.airDate ? " · " : ""}
							{ep.runtime} min
						</Text>
					) : null}
				</View>
				{ep.overview ? <Text style={styles.overview}>{ep.overview}</Text> : null}
			</ScrollView>

			{/* Button row */}
			{isWatched ? (
				<View style={styles.watchedButtonRow}>
					<TouchableOpacity style={[styles.unwatchButton, isMarking && { opacity: 0.6 }]} onPress={onUnwatch} disabled={isMarking}>
						<Text style={styles.unwatchButtonText}>
							{watchCount > 1 ? `−1 (${watchCount - 1})` : "Unwatch"}
						</Text>
					</TouchableOpacity>
					<TouchableOpacity style={[styles.rewatchButton, isMarking && { opacity: 0.6 }]} onPress={onRewatch} disabled={isMarking}>
						{isMarking ? (
							<ActivityIndicator size="small" color={colors.text} />
						) : (
							<Text style={styles.rewatchButtonText}>
								Rewatch{watchCount > 0 ? ` (${watchCount + 1})` : ""}
							</Text>
						)}
					</TouchableOpacity>
				</View>
			) : (
				<TouchableOpacity
					style={[styles.watchButton, isMarking && { opacity: 0.6 }]}
					onPress={onMarkWatched}
					disabled={isMarking}
				>
					{isMarking ? (
						<ActivityIndicator size="small" color={colors.text} />
					) : (
						<Text style={styles.watchButtonText}>Mark as Watched</Text>
					)}
				</TouchableOpacity>
			)}
		</View>
	);
});

// ---------------------------------------------------------------------------
// EpisodeDetailModal (carousel)
// ---------------------------------------------------------------------------

export default function EpisodeDetailModal({
	visible,
	tmdbId,
	showTitle,
	showPosterPath,
	showBackdropPath,
	episodes,
	initialIndex,
	watchedKeys,
	currentNextEpisode,
	onMarkWatched,
	onMarkWatchedThrough,
	onUnmarkWatched,
	onShowPress,
	onClose,
	onLoadEpisodeDetails,
}: Readonly<Props>) {
	const carouselRef = useRef<FlatList>(null);
	const [localWatched, setLocalWatched] = useState<Map<string, number>>(watchedKeys);
	// Enriched episode data — items updated in-place when details load
	const [enrichedEps, setEnrichedEps] = useState<(CarouselEpisode & { loaded?: boolean })[]>(() =>
		episodes.map((ep) => ({
			...ep,
			loaded: !!(ep.overview && ep.stillPath),
		})),
	);
	const loadingSeasons = useRef(new Set<number>());
	const [scrollEnabled, setScrollEnabled] = useState(true);
	const [markingKey, setMarkingKey] = useState<string | null>(null);
	const [activeIndex, setActiveIndex] = useState(initialIndex);

	// Backfill confirm modal
	const [confirmVisible, setConfirmVisible] = useState(false);
	const [confirmLoading, setConfirmLoading] = useState(false);
	const [confirmTarget, setConfirmTarget] = useState<{ season: number; episode: number } | null>(null);

	// Sync watched keys from parent
	useEffect(() => {
		setLocalWatched(watchedKeys);
	}, [watchedKeys]);

	// Reset when modal opens with new data
	useEffect(() => {
		if (!visible) return;
		setEnrichedEps(
			episodes.map((ep) => ({
				...ep,
				loaded: !!(ep.overview && ep.stillPath),
			})),
		);
		setActiveIndex(initialIndex);
	}, [visible, episodes, initialIndex]);

	// Fetch details for a season and enrich the array
	const fetchSeason = useCallback(
		async (seasonNum: number) => {
			if (loadingSeasons.current.has(seasonNum)) return;
			loadingSeasons.current.add(seasonNum);
			try {
				let seasonEps: CarouselEpisode[] | null = null;
				if (onLoadEpisodeDetails) {
					seasonEps = await onLoadEpisodeDetails(seasonNum);
				}
				const detailMap = new Map<string, CarouselEpisode>();
				if (seasonEps) {
					for (const ep of seasonEps) {
						detailMap.set(epKey(ep.season, ep.episode), ep);
					}
				}
				setEnrichedEps((prev) =>
					prev.map((ep) => {
						if (ep.season !== seasonNum || ep.loaded) return ep;
						const detail = detailMap.get(epKey(ep.season, ep.episode));
						return detail
							? { ...detail, loaded: true }
							: { ...ep, loaded: true }; // mark loaded even without detail
					}),
				);
			} finally {
				loadingSeasons.current.delete(seasonNum);
			}
		},
		[onLoadEpisodeDetails],
	);

	// Called directly by Carousel onSnapToItem
	const handleSnap = useCallback(
		(index: number) => {
			setActiveIndex(index);
			// Fetch seasons for visible window
			const seasonsToFetch = new Set<number>();
			for (let i = index; i <= Math.min(index + 2, enrichedEps.length - 1); i++) {
				const ep = enrichedEps[i];
				if (ep && !ep.loaded) {
					seasonsToFetch.add(ep.season);
				}
			}
			for (const sn of seasonsToFetch) {
				fetchSeason(sn);
			}
		},
		[enrichedEps, fetchSeason],
	);

	// Initial load on mount
	useEffect(() => {
		if (!visible) return;
		const seasonsToFetch = new Set<number>();
		const start = Math.max(0, initialIndex);
		const end = Math.min(episodes.length, start + 3);
		for (let i = start; i < end; i++) {
			const ep = episodes[i];
			if (!(ep.overview && ep.stillPath)) {
				seasonsToFetch.add(ep.season);
			}
		}
		for (const sn of seasonsToFetch) {
			fetchSeason(sn);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [visible]);

	// Handle mark watched with backfill check
	const handleMark = useCallback(
		(ep: CarouselEpisode) => {
			const key = epKey(ep.season, ep.episode);
			if (!currentNextEpisode) {
				// No pointer — just mark
				setMarkingKey(key);
				onMarkWatched(tmdbId, ep.season, ep.episode).finally(() => {
					setLocalWatched((prev) => new Map(prev).set(key, (prev.get(key) ?? 0) + 1));
					setMarkingKey(null);
				});
				return;
			}

			// Check if this ep is ahead of currentNextEpisode
			const isAhead =
				ep.season > currentNextEpisode.season ||
				(ep.season === currentNextEpisode.season && ep.episode > currentNextEpisode.episode);
			const isNext =
				ep.season === currentNextEpisode.season && ep.episode === currentNextEpisode.episode;

			if (isNext || !isAhead) {
				// Current next or behind — mark directly
				setMarkingKey(key);
				onMarkWatched(tmdbId, ep.season, ep.episode).finally(() => {
					setLocalWatched((prev) => new Map(prev).set(key, (prev.get(key) ?? 0) + 1));
					setMarkingKey(null);
				});
			} else {
				// Ahead — check for unwatched gaps
				const hasGaps = episodes.some((e) => {
					const eKey = epKey(e.season, e.episode);
					const isBetween =
						(e.season > currentNextEpisode.season ||
							(e.season === currentNextEpisode.season &&
								e.episode >= currentNextEpisode.episode)) &&
						(e.season < ep.season ||
							(e.season === ep.season && e.episode < ep.episode));
					return isBetween && !localWatched.has(eKey);
				});

				if (hasGaps) {
					setConfirmTarget({ season: ep.season, episode: ep.episode });
					setConfirmVisible(true);
				} else {
					setMarkingKey(key);
					onMarkWatched(tmdbId, ep.season, ep.episode).finally(() => {
						setLocalWatched((prev) => new Map(prev).set(key, (prev.get(key) ?? 0) + 1));
						setMarkingKey(null);
					});
				}
			}
		},
		[currentNextEpisode, episodes, localWatched, tmdbId, onMarkWatched],
	);

	// Confirm backfill — mark all through target
	const handleConfirmBackfill = useCallback(async () => {
		if (!confirmTarget) return;
		setConfirmLoading(true);
		const key = epKey(confirmTarget.season, confirmTarget.episode);
		setMarkingKey(key);

		try {
			await onMarkWatchedThrough(tmdbId, confirmTarget.season, confirmTarget.episode);

			// Optimistically mark all eps up through target as watched
			setLocalWatched((prev) => {
				const next = new Map(prev);
				for (const ep of episodes) {
					if (
						ep.season < confirmTarget.season ||
						(ep.season === confirmTarget.season && ep.episode <= confirmTarget.episode)
					) {
						const k = epKey(ep.season, ep.episode);
						if (!next.has(k)) next.set(k, 1);
					}
				}
				return next;
			});
		} finally {
			setMarkingKey(null);
			setConfirmLoading(false);
			setConfirmVisible(false);
			setConfirmTarget(null);
		}
	}, [confirmTarget, tmdbId, episodes, onMarkWatchedThrough]);

	// Decline backfill — mark only target
	const handleDeclineBackfill = useCallback(async () => {
		if (!confirmTarget) return;
		setConfirmVisible(false);
		const key = epKey(confirmTarget.season, confirmTarget.episode);
		setMarkingKey(key);

		try {
			await onMarkWatched(tmdbId, confirmTarget.season, confirmTarget.episode);
			setLocalWatched((prev) => new Map(prev).set(key, (prev.get(key) ?? 0) + 1));
		} finally {
			setMarkingKey(null);
			setConfirmTarget(null);
		}
	}, [confirmTarget, tmdbId, onMarkWatched]);

	const renderItem = useCallback(
		({ item }: { item: CarouselEpisode & { loaded?: boolean }; index: number }) => {
			const key = epKey(item.season, item.episode);
			const wc = localWatched.get(key) ?? 0;
			const isWatched = wc > 0;

			return (
				<View style={styles.cardWrapper}>
					<EpisodeCard
						ep={item}
						showTitle={showTitle}
						showPosterPath={showPosterPath}
						showBackdropPath={showBackdropPath}
						isWatched={isWatched}
						watchCount={wc}
						isLoaded={!!item.loaded}
						isMarking={markingKey === key}
						onMarkWatched={() => handleMark(item)}
						onUnwatch={() => {
							setMarkingKey(key);
							onUnmarkWatched(tmdbId, item.season, item.episode).finally(() => {
								setLocalWatched((prev) => {
									const n = new Map(prev);
									const count = n.get(key) ?? 1;
									if (count <= 1) {
										n.delete(key);
									} else {
										n.set(key, count - 1);
									}
									return n;
								});
								setMarkingKey(null);
							});
						}}
						onRewatch={() => {
							setMarkingKey(key);
							onMarkWatched(tmdbId, item.season, item.episode).finally(() =>
								setMarkingKey(null),
							);
						}}
						onShowPress={onShowPress}
					/>
				</View>
			);
		},
		[
			localWatched,
			markingKey,
			handleMark,
			showTitle,
			showPosterPath,
			showBackdropPath,
			tmdbId,
			onUnmarkWatched,
			onMarkWatched,
			onShowPress,
		],
	);

	const confirmLabel = confirmTarget
		? `E${String(currentNextEpisode?.episode ?? 1).padStart(2, "0")}–E${String(confirmTarget.episode).padStart(2, "0")}`
		: "";

	const getItemLayout = useCallback(
		(_: any, index: number) => ({
			length: SNAP_INTERVAL,
			offset: SNAP_INTERVAL * index,
			index,
		}),
		[],
	);

	const onViewableItemsChanged = useRef(
		({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
			if (viewableItems.length > 0 && viewableItems[0].index != null) {
				handleSnap(viewableItems[0].index);
			}
		},
	).current;

	const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
			<View style={styles.modalOverlay}>
				<Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
				<FlatList
					ref={carouselRef}
					data={enrichedEps}
					renderItem={renderItem}
					keyExtractor={(item) => epKey(item.season, item.episode)}
					horizontal
					snapToInterval={SNAP_INTERVAL}
					decelerationRate="fast"
					scrollEnabled={scrollEnabled}
					showsHorizontalScrollIndicator={false}
					initialScrollIndex={initialIndex}
					getItemLayout={getItemLayout}
					onViewableItemsChanged={onViewableItemsChanged}
					viewabilityConfig={viewabilityConfig}
					contentContainerStyle={{
						gap: CARD_GAP,
						paddingHorizontal: SIDE_PADDING,
					}}
					style={{ flexGrow: 0 }}
				/>
				{enrichedEps.length > 1 && (
					<View style={styles.dotRow}>
						{activeIndex > 0 && <View style={styles.dot} />}
						<View style={[styles.dot, styles.dotActive]} />
						{activeIndex < enrichedEps.length - 1 && <View style={styles.dot} />}
					</View>
				)}
			</View>
			{confirmVisible && (
				<AnimatedModal
					visible={confirmVisible}
					onClose={() => {
						setConfirmVisible(false);
						setConfirmTarget(null);
					}}
				>
					<View style={styles.backfillContent}>
						<Text style={styles.backfillTitle}>Mark Previous Episodes?</Text>
						<Text style={styles.backfillHint}>
							Mark episodes {confirmLabel} as watched?
						</Text>
						<TouchableOpacity
							style={[styles.backfillButton, { backgroundColor: colors.watchedGreen }, confirmLoading && { opacity: 0.6 }]}
							onPress={handleConfirmBackfill}
							disabled={confirmLoading}
						>
							{confirmLoading ? (
								<ActivityIndicator size="small" color={colors.text} />
							) : (
								<Text style={styles.backfillButtonText}>Mark All</Text>
							)}
						</TouchableOpacity>
						<TouchableOpacity
							style={[styles.backfillButtonOutline, confirmLoading && { opacity: 0.6 }]}
							onPress={handleDeclineBackfill}
							disabled={confirmLoading}
						>
							<Text style={styles.backfillButtonOutlineText}>Just This One</Text>
						</TouchableOpacity>
						{!confirmLoading && (
							<TouchableOpacity
								style={styles.backfillCancel}
								onPress={() => {
									setConfirmVisible(false);
									setConfirmTarget(null);
								}}
							>
								<Text style={styles.backfillCancelText}>Cancel</Text>
							</TouchableOpacity>
						)}
					</View>
				</AnimatedModal>
			)}
		</Modal>
	);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
	modalOverlay: {
		flex: 1,
		backgroundColor: colors.overlayMedium,
		justifyContent: "center",
		alignItems: "center",
	},
	cardWrapper: {
		width: CARD_WIDTH,
	},
	cardContent: {
		width: CARD_WIDTH,
		height: CARD_HEIGHT,
		backgroundColor: colors.surface,
		borderRadius: 12,
		overflow: "hidden",
	},
	imageContainer: {
		height: 160,
	},
	imageSkeleton: {
		...(StyleSheet.absoluteFill as object),
		backgroundColor: colors.surfaceLight,
	},
	still: {
		width: "100%",
		height: 160,
	},
	imageGradient: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		height: 80,
	},
	stillPlaceholder: {
		width: "100%",
		height: 160,
		backgroundColor: colors.surfaceLight,
		justifyContent: "center",
		alignItems: "center",
	},
	stillPlaceholderText: {
		fontSize: 40,
		fontWeight: "700",
		color: colors.textMuted,
		letterSpacing: 2,
	},
	scroll: {
		flexGrow: 1,
		flexShrink: 1,
		padding: spacing.lg,
		marginTop: -50,
	},
	titlePill: {
		flexDirection: "row",
		alignItems: "center",
		alignSelf: "flex-start",
		borderWidth: 1.5,
		borderColor: colors.text,
		borderRadius: 14,
		paddingHorizontal: spacing.sm,
		paddingVertical: 3,
		marginBottom: spacing.sm,
	},
	titlePillText: {
		fontSize: 11,
		fontWeight: "600",
		color: colors.text,
		flexShrink: 1,
		letterSpacing: 0.5,
	},
	titlePillArrowText: {
		fontSize: 14,
		color: colors.text,
		marginLeft: spacing.xs,
	},
	label: {
		...typography.subtitle,
		fontSize: 16,
		fontWeight: "700",
		color: colors.text,
		letterSpacing: 1,
		paddingHorizontal: spacing.sm,
	},
	episodeTitle: {
		...typography.title,
		color: colors.text,
		marginBottom: spacing.xs,
		fontSize: 18,
		paddingHorizontal: spacing.sm,
	},
	metaRow: {
		flexDirection: "row",
		marginTop: spacing.md,
		paddingHorizontal: spacing.sm,
	},
	meta: {
		...typography.caption,
		color: colors.textSecondary,
	},
	overview: {
		...typography.body,
		color: colors.textSecondary,
		marginTop: spacing.md,
		lineHeight: 20,
		fontSize: 13,
		paddingHorizontal: spacing.sm,
		textAlign: "justify",
	},
	watchButton: {
		backgroundColor: colors.watchedGreen,
		paddingVertical: spacing.md,
		marginHorizontal: spacing.lg,
		marginBottom: spacing.lg,
		borderRadius: 8,
		alignItems: "center",
	},
	watchButtonText: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.text,
	},
	watchedButtonRow: {
		flexDirection: "row",
		gap: spacing.sm,
		marginHorizontal: spacing.lg,
		marginBottom: spacing.lg,
	},
	unwatchButton: {
		flex: 1,
		paddingVertical: spacing.md,
		borderRadius: 8,
		alignItems: "center",
		backgroundColor: colors.destructiveRed,
	},
	unwatchButtonText: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.text,
	},
	rewatchButton: {
		flex: 1,
		backgroundColor: colors.stopBlue,
		paddingVertical: spacing.md,
		borderRadius: 8,
		alignItems: "center",
	},
	rewatchButtonText: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.text,
	},
	dotRow: {
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		gap: 6,
		marginTop: spacing.sm,
	},
	dot: {
		width: 6,
		height: 6,
		borderRadius: 3,
		backgroundColor: colors.textMuted,
		opacity: 0.4,
	},
	dotActive: {
		width: 8,
		height: 8,
		borderRadius: 4,
		opacity: 1,
		backgroundColor: colors.text,
	},
	skeletonBody: {
		padding: spacing.lg,
		gap: spacing.sm,
	},
	skeletonTitle: {
		height: 16,
		width: "60%",
		borderRadius: 4,
		backgroundColor: colors.border,
		marginBottom: spacing.sm,
	},
	skeletonLine: {
		height: 12,
		borderRadius: 4,
		backgroundColor: colors.border,
		marginBottom: spacing.sm,
	},
	skeletonLineShort: {
		height: 12,
		width: "70%",
		borderRadius: 4,
		backgroundColor: colors.border,
	},
	backfillContent: {
		backgroundColor: colors.surface,
		borderRadius: 12,
		padding: spacing.lg,
	},
	backfillTitle: {
		...typography.subtitle,
		fontSize: 16,
		textAlign: "center",
		marginBottom: spacing.sm,
	},
	backfillHint: {
		...typography.caption,
		color: colors.textSecondary,
		textAlign: "center",
		marginBottom: spacing.lg,
	},
	backfillButton: {
		paddingVertical: spacing.md,
		borderRadius: 8,
		alignItems: "center",
	},
	backfillButtonText: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.text,
	},
	backfillButtonOutline: {
		paddingVertical: spacing.md,
		borderRadius: 8,
		alignItems: "center",
		borderWidth: 1.5,
		borderColor: colors.text,
		marginTop: spacing.sm,
	},
	backfillButtonOutlineText: {
		...typography.subtitle,
		fontSize: 14,
		color: colors.text,
	},
	backfillCancel: {
		paddingVertical: spacing.sm,
		alignItems: "center",
		marginTop: spacing.sm,
	},
	backfillCancelText: {
		...typography.caption,
		color: colors.textMuted,
	},
});
