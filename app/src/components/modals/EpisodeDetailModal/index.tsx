import { useState, useRef, useEffect, useCallback } from "react";
import { View, FlatList, Pressable, Animated, Modal } from "react-native";

import { SNAP_INTERVAL, CARD_GAP, SIDE_PADDING, AnimatedFlatList, epKey } from "./constants";
import { styles } from "./styles";
import { Card3DWrapper } from "./Card3DWrapper";
import { EpisodeCard } from "./EpisodeCard";
import { BackfillModal } from "./BackfillModal";
import type {
	CarouselEpisode,
	EnrichedEpisode,
	EpisodeDetailModalProps,
} from "../../../types/episodeCarousel";

export type { CarouselEpisode } from "../../../types/episodeCarousel";

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
	onIndexChange,
}: Readonly<EpisodeDetailModalProps>) {
	const carouselRef = useRef<FlatList>(null);
	const [localWatched, setLocalWatched] = useState<Map<string, number>>(watchedKeys);
	const noLoader = !onLoadEpisodeDetails;
	const [enrichedEps, setEnrichedEps] = useState<EnrichedEpisode[]>(() =>
		episodes.map((ep) => ({
			...ep,
			loaded: noLoader || !!(ep.overview && ep.stillPath),
		})),
	);
	const loadingSeasons = useRef(new Set<number>());
	const scrollX = useRef(new Animated.Value(initialIndex * SNAP_INTERVAL)).current;
	const [scrollEnabled, setScrollEnabled] = useState(true);
	const [markingKey, setMarkingKey] = useState<string | null>(null);
	const [activeIndex, setActiveIndex] = useState(initialIndex);

	// Backfill confirm
	const [confirmVisible, setConfirmVisible] = useState(false);
	const [confirmLoading, setConfirmLoading] = useState(false);
	const [confirmTarget, setConfirmTarget] = useState<{ season: number; episode: number } | null>(
		null,
	);

	useEffect(() => {
		setLocalWatched(watchedKeys);
	}, [watchedKeys]);

	useEffect(() => {
		if (!visible) return;
		setEnrichedEps(
			episodes.map((ep) => ({
				...ep,
				loaded: noLoader || !!(ep.overview && ep.stillPath),
			})),
		);
		setActiveIndex(initialIndex);
		scrollX.setValue(initialIndex * SNAP_INTERVAL);
	}, [visible, episodes, initialIndex, noLoader, scrollX]);

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
						return detail ? { ...detail, loaded: true } : { ...ep, loaded: true };
					}),
				);
			} finally {
				loadingSeasons.current.delete(seasonNum);
			}
		},
		[onLoadEpisodeDetails],
	);

	const handleSnap = useCallback(
		(index: number) => {
			setActiveIndex(index);
			onIndexChange?.(index, enrichedEps.length);
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
		[enrichedEps, fetchSeason, onIndexChange],
	);

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

	const handleMark = useCallback(
		(ep: CarouselEpisode) => {
			const key = epKey(ep.season, ep.episode);
			if (!currentNextEpisode) {
				setMarkingKey(key);
				onMarkWatched(tmdbId, ep.season, ep.episode).finally(() => {
					setLocalWatched((prev) => new Map(prev).set(key, (prev.get(key) ?? 0) + 1));
					setMarkingKey(null);
				});
				return;
			}

			const isAhead =
				ep.season > currentNextEpisode.season ||
				(ep.season === currentNextEpisode.season && ep.episode > currentNextEpisode.episode);
			const isNext =
				ep.season === currentNextEpisode.season && ep.episode === currentNextEpisode.episode;

			if (isNext || !isAhead) {
				setMarkingKey(key);
				onMarkWatched(tmdbId, ep.season, ep.episode).finally(() => {
					setLocalWatched((prev) => new Map(prev).set(key, (prev.get(key) ?? 0) + 1));
					setMarkingKey(null);
				});
			} else {
				const hasGaps = episodes.some((e) => {
					const eKey = epKey(e.season, e.episode);
					const isBetween =
						(e.season > currentNextEpisode.season ||
							(e.season === currentNextEpisode.season &&
								e.episode >= currentNextEpisode.episode)) &&
						(e.season < ep.season || (e.season === ep.season && e.episode < ep.episode));
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

	const handleConfirmBackfill = useCallback(async () => {
		if (!confirmTarget) return;
		setConfirmLoading(true);
		const key = epKey(confirmTarget.season, confirmTarget.episode);
		setMarkingKey(key);

		try {
			await onMarkWatchedThrough(tmdbId, confirmTarget.season, confirmTarget.episode);
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
		({ item, index }: { item: EnrichedEpisode; index: number }) => {
			const key = epKey(item.season, item.episode);
			const wc = localWatched.get(key) ?? 0;
			const isWatched = wc > 0;

			return (
				<Card3DWrapper index={index} scrollX={scrollX}>
					<Pressable onPress={() => {}}>
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
								onMarkWatched(tmdbId, item.season, item.episode).finally(() => {
									setLocalWatched((prev) => new Map(prev).set(key, (prev.get(key) ?? 0) + 1));
									setMarkingKey(null);
								});
							}}
							onShowPress={onShowPress}
						/>
					</Pressable>
				</Card3DWrapper>
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
			scrollX,
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
			<Pressable style={styles.modalOverlay} onPress={onClose}>
				<AnimatedFlatList
					ref={carouselRef}
					data={enrichedEps}
					renderItem={renderItem}
					keyExtractor={(item: CarouselEpisode) => epKey(item.season, item.episode)}
					horizontal
					snapToInterval={SNAP_INTERVAL}
					snapToAlignment="start"
					decelerationRate="fast"
					scrollEnabled={scrollEnabled}
					showsHorizontalScrollIndicator={false}
					initialScrollIndex={initialIndex}
					getItemLayout={getItemLayout}
					onViewableItemsChanged={onViewableItemsChanged}
					viewabilityConfig={viewabilityConfig}
					onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
						useNativeDriver: true,
					})}
					scrollEventThrottle={16}
					contentContainerStyle={{
						paddingHorizontal: SIDE_PADDING,
					}}
					windowSize={5}
					maxToRenderPerBatch={3}
					style={{ flexGrow: 0 }}
				/>
				{enrichedEps.length > 1 && (
					<View style={styles.dotRow}>
						{activeIndex > 0 && <View style={styles.dot} />}
						<View style={[styles.dot, styles.dotActive]} />
						{activeIndex < enrichedEps.length - 1 && <View style={styles.dot} />}
					</View>
				)}
			</Pressable>
			{confirmVisible && (
				<BackfillModal
					visible={confirmVisible}
					confirmLabel={confirmLabel}
					loading={confirmLoading}
					onConfirm={handleConfirmBackfill}
					onDecline={handleDeclineBackfill}
					onCancel={() => {
						setConfirmVisible(false);
						setConfirmTarget(null);
					}}
				/>
			)}
		</Modal>
	);
}
