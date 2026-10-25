import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { View, FlatList, Pressable, Animated, Modal } from "react-native";

import { SNAP_INTERVAL, CARD_GAP, SIDE_PADDING, AnimatedFlatList, epKey } from "./constants";
import { styles } from "./styles";
import { Card3DWrapper } from "./Card3DWrapper";
import { EpisodeCard } from "./EpisodeCard";
import { BackfillModal } from "./BackfillModal";
import { markWatchedLabel } from "../../../utils/format";
import { carouselRunBase } from "../../../utils/trackingAdvance";
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
	rewatchCount = 0,
	onMarkWatched,
	onMarkWatchedThrough,
	onUnmarkWatched,
	onSkipEpisode,
	onShowPress,
	onClose,
	onLoadEpisodeDetails,
	onIndexChange,
	readOnly,
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
		if (visible) console.log("DBGMODAL modal effect", Date.now() - ((globalThis as any).__dbgModalT0 ?? 0), "ms");
	}, [visible]);

	// Watched in this run = count above runBase. From the counts the modal opened with (the
	// pointer episode sits at it), not the stored rewatch number — that one can lag, which
	// showed the next rewatch episode as already watched (Unwatch / Rewatch / Skip)
	const runBase = useMemo(() => {
		const inRewatch = rewatchCount > 0 || !!onSkipEpisode;
		if (!inRewatch || !currentNextEpisode) return inRewatch ? Math.max(1, rewatchCount) : 0;
		const at = episodes.findIndex(
			(e) => e.season === currentNextEpisode.season && e.episode === currentNextEpisode.episode,
		);
		const prev = at > 0 ? episodes[at - 1] : null;
		return carouselRunBase(
			true,
			watchedKeys.get(epKey(currentNextEpisode.season, currentNextEpisode.episode)),
			prev ? watchedKeys.get(epKey(prev.season, prev.episode)) : null,
			rewatchCount,
		);
	}, [rewatchCount, onSkipEpisode, currentNextEpisode, episodes, watchedKeys]);

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
				onMarkWatched(tmdbId, ep.season, ep.episode, ep.runtime).finally(() => {
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
				onMarkWatched(tmdbId, ep.season, ep.episode, ep.runtime).finally(() => {
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
					return isBetween && (localWatched.get(eKey) ?? 0) <= runBase;
				});

				if (hasGaps) {
					setConfirmTarget({ season: ep.season, episode: ep.episode });
					setConfirmVisible(true);
				} else {
					setMarkingKey(key);
					onMarkWatched(tmdbId, ep.season, ep.episode, ep.runtime).finally(() => {
						setLocalWatched((prev) => new Map(prev).set(key, (prev.get(key) ?? 0) + 1));
						setMarkingKey(null);
					});
				}
			}
		},
		[currentNextEpisode, episodes, localWatched, runBase, tmdbId, onMarkWatched],
	);

	const handleConfirmBackfill = useCallback(async () => {
		if (!confirmTarget) return;
		setConfirmLoading(true);
		const key = epKey(confirmTarget.season, confirmTarget.episode);
		setMarkingKey(key);

		try {
			const markedRefs = await onMarkWatchedThrough(
				tmdbId,
				confirmTarget.season,
				confirmTarget.episode,
			);
			// Mirror the write: the episodes the handler reports, else every episode from the
			// current next one through the target gets one more watch (already-counted ones too
			// during a rewatch)
			const from = currentNextEpisode ?? { season: 1, episode: 1 };
			const onOrAfter = (s: number, e: number) =>
				s > from.season || (s === from.season && e >= from.episode);
			const onOrBefore = (s: number, e: number) =>
				s < confirmTarget.season || (s === confirmTarget.season && e <= confirmTarget.episode);
			const reported = markedRefs
				? new Set(markedRefs.map((r) => epKey(r.season, r.episode)))
				: null;
			setLocalWatched((prev) => {
				const next = new Map(prev);
				for (const ep of episodes) {
					const inRange = reported
						? reported.has(epKey(ep.season, ep.episode))
						: onOrAfter(ep.season, ep.episode) && onOrBefore(ep.season, ep.episode);
					if (inRange) {
						const k = epKey(ep.season, ep.episode);
						next.set(k, (next.get(k) ?? 0) + 1);
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
		// Caught up through this card (a failed mark threw above): slide on to the next one, or close
		// after the last
		const at = enrichedEps.findIndex(
			(e) => e.season === confirmTarget.season && e.episode === confirmTarget.episode,
		);
		if (at >= 0 && at < enrichedEps.length - 1) {
			carouselRef.current?.scrollToIndex({ index: at + 1, animated: true });
		} else {
			onClose();
		}
	}, [
		confirmTarget,
		tmdbId,
		episodes,
		enrichedEps,
		onMarkWatchedThrough,
		currentNextEpisode,
		onClose,
	]);

	const handleDeclineBackfill = useCallback(async () => {
		if (!confirmTarget) return;
		setConfirmVisible(false);
		const key = epKey(confirmTarget.season, confirmTarget.episode);
		setMarkingKey(key);

		try {
			const target = enrichedEps.find(
				(e) => e.season === confirmTarget.season && e.episode === confirmTarget.episode,
			);
			await onMarkWatched(tmdbId, confirmTarget.season, confirmTarget.episode, target?.runtime);
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
			// Rewatch n is a fresh run: watched only once seen more than n times
			const isWatched = wc > runBase;
			const isCurrentNext =
				currentNextEpisode?.season === item.season && currentNextEpisode?.episode === item.episode;
			const onSkip =
				onSkipEpisode && isCurrentNext
					? () => {
							setMarkingKey(key);
							onSkipEpisode(tmdbId, item.season, item.episode).finally(() => setMarkingKey(null));
						}
					: undefined;

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
							readOnly={readOnly}
							markLabel={markWatchedLabel(runBase)}
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
								onMarkWatched(tmdbId, item.season, item.episode, item.runtime).finally(() => {
									setLocalWatched((prev) => new Map(prev).set(key, (prev.get(key) ?? 0) + 1));
									setMarkingKey(null);
								});
							}}
							onSkip={onSkip}
							onShowPress={onShowPress}
						/>
					</Pressable>
				</Card3DWrapper>
			);
		},
		[
			localWatched,
			markingKey,
			readOnly,
			handleMark,
			showTitle,
			showPosterPath,
			showBackdropPath,
			tmdbId,
			onUnmarkWatched,
			onMarkWatched,
			onSkipEpisode,
			currentNextEpisode,
			runBase,
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
					disableIntervalMomentum
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
