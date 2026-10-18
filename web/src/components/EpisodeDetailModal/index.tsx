import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { IoChevronBack, IoChevronForward } from "react-icons/io5";
import type { CarouselEpisode, EnrichedEpisode, EpisodeDetailModalProps } from "@app/types";
import ConfirmModal from "../ConfirmModal";
import { ModalArt, SPEEDSTER_ART } from "../ModalArt";
import { SKIP_AHEAD_TITLE, skipAheadConfirm, skipAheadHint } from "@app/utils/format";
import { colors } from "../../theme/index";
import EpisodeCard from "./EpisodeCard";
import { markWatchedLabel } from "@app/utils/format";
import { epKey } from "./helpers";
import styles from "./styles/EpisodeDetailModal.module.scss";
import { cssVars } from "../../utils/cssVars";

// readOnly (no watch buttons): logged-out visitors and the Calendar
type Props = EpisodeDetailModalProps;

const SIDE_SCALE = 0.88;
const SIDE_ROTATE_DEG = 12;

/**
 * Swipeable episode carousel (app EpisodeDetailModal): scroll-snap on touch,
 * arrows/keys on desktop, 3D-tilted side cards, seasons loaded lazily.
 */
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
}: Props) {
	const scrollerRef = useRef<HTMLDivElement>(null);
	const [localWatched, setLocalWatched] = useState<Map<string, number>>(watchedKeys);
	const noLoader = !onLoadEpisodeDetails;
	const [enrichedEps, setEnrichedEps] = useState<EnrichedEpisode[]>([]);
	const loadingSeasons = useRef(new Set<number>());
	const [scrollPos, setScrollPos] = useState(initialIndex);
	const [markingKey, setMarkingKey] = useState<string | null>(null);
	const [activeIndex, setActiveIndex] = useState(initialIndex);
	const [confirmTarget, setConfirmTarget] = useState<{ season: number; episode: number } | null>(null);
	const [confirmLoading, setConfirmLoading] = useState(false);

	useEffect(() => setLocalWatched(watchedKeys), [watchedKeys]);

	useEffect(() => {
		if (!visible) return;
		setEnrichedEps(episodes.map((ep) => ({ ...ep, loaded: noLoader || !!(ep.overview && ep.stillPath) })));
		setActiveIndex(initialIndex);
		setScrollPos(initialIndex);
	}, [visible, episodes, initialIndex, noLoader]);

	const snapWidth = () => scrollerRef.current?.firstElementChild?.getBoundingClientRect().width ?? 1;

	// Open on the tapped episode
	useLayoutEffect(() => {
		if (!visible || !scrollerRef.current) return;
		const el = scrollerRef.current;
		requestAnimationFrame(() => {
			el.scrollLeft = initialIndex * snapWidth();
		});
	}, [visible, initialIndex, enrichedEps.length]);

	const fetchSeason = useCallback(
		async (seasonNum: number) => {
			if (loadingSeasons.current.has(seasonNum)) return;
			loadingSeasons.current.add(seasonNum);
			try {
				const seasonEps = onLoadEpisodeDetails ? await onLoadEpisodeDetails(seasonNum) : null;
				const detailMap = new Map<string, CarouselEpisode>();
				for (const ep of seasonEps ?? []) detailMap.set(epKey(ep.season, ep.episode), ep);
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

	// Load details for the visible card + the next two
	useEffect(() => {
		if (!visible) return;
		const seasons = new Set<number>();
		for (let i = activeIndex; i <= Math.min(activeIndex + 2, enrichedEps.length - 1); i++) {
			const ep = enrichedEps[i];
			if (ep && !ep.loaded) seasons.add(ep.season);
		}
		seasons.forEach(fetchSeason);
	}, [visible, activeIndex, enrichedEps, fetchSeason]);

	const onScroll = () => {
		const el = scrollerRef.current;
		if (!el) return;
		const pos = el.scrollLeft / snapWidth();
		setScrollPos(pos);
		const idx = Math.round(pos);
		if (idx !== activeIndex) {
			setActiveIndex(idx);
			onIndexChange?.(idx, enrichedEps.length);
		}
	};

	const scrollTo = useCallback((idx: number) => {
		scrollerRef.current?.scrollTo({ left: idx * snapWidth(), behavior: "smooth" });
	}, []);

	useEffect(() => {
		if (!visible) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
			if (e.key === "ArrowRight") scrollTo(Math.min(activeIndex + 1, enrichedEps.length - 1));
			if (e.key === "ArrowLeft") scrollTo(Math.max(activeIndex - 1, 0));
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [visible, activeIndex, enrichedEps.length, onClose, scrollTo]);

	const bump = (key: string, delta: number) =>
		setLocalWatched((prev) => {
			const next = new Map(prev);
			const count = (next.get(key) ?? 0) + delta;
			if (count <= 0) next.delete(key);
			else next.set(key, count);
			return next;
		});

	const markOne = (ep: CarouselEpisode) => {
		const key = epKey(ep.season, ep.episode);
		setMarkingKey(key);
		onMarkWatched(tmdbId, ep.season, ep.episode).finally(() => {
			bump(key, 1);
			setMarkingKey(null);
		});
	};

	// Same gap rule as the app: marking past the next episode offers to backfill
	const handleMark = (ep: CarouselEpisode) => {
		if (!currentNextEpisode) return markOne(ep);
		const isAhead =
			ep.season > currentNextEpisode.season ||
			(ep.season === currentNextEpisode.season && ep.episode > currentNextEpisode.episode);
		if (!isAhead) return markOne(ep);
		const hasGaps = episodes.some((e) => {
			const between =
				(e.season > currentNextEpisode.season ||
					(e.season === currentNextEpisode.season && e.episode >= currentNextEpisode.episode)) &&
				(e.season < ep.season || (e.season === ep.season && e.episode < ep.episode));
			return between && (localWatched.get(epKey(e.season, e.episode)) ?? 0) <= rewatchCount;
		});
		if (hasGaps) setConfirmTarget({ season: ep.season, episode: ep.episode });
		else markOne(ep);
	};

	const confirmBackfill = async () => {
		if (!confirmTarget) return;
		setConfirmLoading(true);
		setMarkingKey(epKey(confirmTarget.season, confirmTarget.episode));
		let marked = false;
		try {
			await onMarkWatchedThrough(tmdbId, confirmTarget.season, confirmTarget.episode);
			// Mirror the write: one more watch for every episode from the current next one through
			// the target (in a rewatch they all had counts already — cards used to stay stale)
			const from = currentNextEpisode ?? { season: 1, episode: 1 };
			const onOrAfter = (s: number, e: number) => s > from.season || (s === from.season && e >= from.episode);
			const onOrBefore = (s: number, e: number) =>
				s < confirmTarget.season || (s === confirmTarget.season && e <= confirmTarget.episode);
			setLocalWatched((prev) => {
				const next = new Map(prev);
				for (const ep of episodes) {
					if (onOrAfter(ep.season, ep.episode) && onOrBefore(ep.season, ep.episode)) {
						const k = epKey(ep.season, ep.episode);
						next.set(k, (next.get(k) ?? 0) + 1);
					}
				}
				return next;
			});
			marked = true;
		} finally {
			setMarkingKey(null);
			setConfirmLoading(false);
			setConfirmTarget(null);
		}
		// Caught up through this card: slide on to the next one, or close after the last
		if (!marked) return;
		const at = enrichedEps.findIndex((e) => e.season === confirmTarget.season && e.episode === confirmTarget.episode);
		if (at >= 0 && at < enrichedEps.length - 1) scrollTo(at + 1);
		else onClose();
	};

	const confirmLabel = confirmTarget
		? `E${String(currentNextEpisode?.episode ?? 1).padStart(2, "0")}–E${String(confirmTarget.episode).padStart(2, "0")}`
		: "";

	return createPortal(
		<>
			<AnimatePresence>
				{visible && (
					<motion.div
						className={styles.overlay}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={onClose}
					>
						<div className={styles.scroller} ref={scrollerRef} onScroll={onScroll}>
							{enrichedEps.map((ep, index) => {
								const key = epKey(ep.season, ep.episode);
								const wc = localWatched.get(key) ?? 0;
								const d = Math.max(-1, Math.min(1, index - scrollPos));
								const isCurrentNext =
									currentNextEpisode?.season === ep.season && currentNextEpisode?.episode === ep.episode;
								return (
									<div key={key} className={styles.slide}>
										<div
											className={`${styles.cardWrapper} ${index !== activeIndex ? styles.sideCard : ""} [transform:perspective(900px)_rotateY(var(--ry))_scale(var(--sc))]`}
											onClick={(e) => {
												e.stopPropagation();
												// Side card: bring it to the centre instead of acting on it
												if (index !== activeIndex) scrollTo(index);
											}}
											style={cssVars({ "--ry": `${-d * SIDE_ROTATE_DEG}deg`, "--sc": 1 - Math.abs(d) * (1 - SIDE_SCALE) })}
										>
											<EpisodeCard
												ep={ep}
												showTitle={showTitle}
												showPosterPath={showPosterPath}
												showBackdropPath={showBackdropPath}
												// Rewatch n is a fresh run: watched only once seen more than n times
												isWatched={wc > rewatchCount}
												watchCount={wc}
												isLoaded={!!ep.loaded}
												isMarking={markingKey === key}
												markLabel={markWatchedLabel(rewatchCount)}
												readOnly={readOnly}
												onMarkWatched={() => handleMark(ep)}
												onUnwatch={() => {
													setMarkingKey(key);
													onUnmarkWatched(tmdbId, ep.season, ep.episode).finally(() => {
														bump(key, -1);
														setMarkingKey(null);
													});
												}}
												onRewatch={() => markOne(ep)}
												onSkip={
													onSkipEpisode && isCurrentNext && !readOnly
														? () => {
																setMarkingKey(key);
																onSkipEpisode(tmdbId, ep.season, ep.episode).finally(() => setMarkingKey(null));
															}
														: undefined
												}
												onShowPress={onShowPress}
											/>
										</div>
									</div>
								);
							})}
						</div>

						{enrichedEps.length > 1 && (
							<>
								<button
									className={`${styles.arrow} ${styles.arrowLeft}`}
									aria-label="Previous episode"
									disabled={activeIndex === 0}
									onClick={(e) => {
										e.stopPropagation();
										scrollTo(activeIndex - 1);
									}}
								>
									<IoChevronBack size={22} />
								</button>
								<button
									className={`${styles.arrow} ${styles.arrowRight}`}
									aria-label="Next episode"
									disabled={activeIndex >= enrichedEps.length - 1}
									onClick={(e) => {
										e.stopPropagation();
										scrollTo(activeIndex + 1);
									}}
								>
									<IoChevronForward size={22} />
								</button>
								<div className={styles.dotRow}>
									{activeIndex > 0 && <span className={styles.dot} />}
									<span className={`${styles.dot} ${styles.dotActive}`} />
									{activeIndex < enrichedEps.length - 1 && <span className={styles.dot} />}
								</div>
							</>
						)}
					</motion.div>
				)}
			</AnimatePresence>

			<ConfirmModal
				visible={!!confirmTarget}
				title={SKIP_AHEAD_TITLE}
				hideCancel
				image={<ModalArt src={SPEEDSTER_ART} />}
				hint={skipAheadHint(confirmLabel)}
				confirmLabel={skipAheadConfirm(confirmLabel)}
				confirmColor={colors.watchedGreen}
				loading={confirmLoading}
				onConfirm={confirmBackfill}
				secondaryLabel="Just This One"
				onSecondary={() => {
					const t = confirmTarget!;
					setConfirmTarget(null);
					markOne({ season: t.season, episode: t.episode } as CarouselEpisode);
				}}
				onClose={() => setConfirmTarget(null)}
			/>
		</>,
		document.body,
	);
}
