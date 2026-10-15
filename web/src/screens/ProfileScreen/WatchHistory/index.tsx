import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import InfiniteScroll from "react-infinite-scroll-component";
import { useWatchHistory } from "@app/hooks/useWatchHistory";
import { CircleButtonTone, MediaType } from "@app/enums";
import SlidingTabs from "../../../components/SlidingTabs";
import { CircleBackButton, CircleButtonSpacer } from "../../../components/CircleButton";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { useHideTabBar } from "../../../hooks/useHideTabBar";
import { Paths, showPath } from "../../../routes/paths";
import HistoryCard from "./HistoryCard";
import Masonry from "../../../components/Masonry";
import { useColumnCount } from "../../../hooks/useColumnCount";
import styles from "./styles/WatchHistory.module.scss";

const TABS = [
	{ key: MediaType.TV, label: "TV Shows" },
	{ key: MediaType.MOVIE, label: "Movies" },
];
const SKELETONS = [0, 1, 2];
// Horizontal drag (px) that flips to the neighbouring tab
const SWIPE_PX = 60;

/** One tab's list — mounted only while active, so the other tab doesn't fetch */
function HistoryList({ mediaType }: { mediaType: MediaType }) {
	const navigate = useNavigate();
	const { cards, loading, hasMore, error, loadMore } = useWatchHistory(mediaType);
	const columns = useColumnCount();

	if (loading) {
		return (
			<div className={styles.grid} aria-busy>
				{SKELETONS.map((i) => (
					<div key={i} className={styles.skeleton} />
				))}
			</div>
		);
	}
	if (cards.length === 0) return <p className={styles.empty}>{error ?? "Nothing watched yet"}</p>;

	return (
		<InfiniteScroll
			dataLength={cards.length}
			next={loadMore}
			hasMore={hasMore}
			loader={
				<div className={styles.footer}>
					<LoadingSpinner />
				</div>
			}
			scrollThreshold={0.8}
			className="overflow-visible!"
		>
			<Masonry
				items={cards}
				columns={columns}
				getKey={(card) => card.id}
				renderItem={(card) => <HistoryCard card={card} onClick={() => navigate(showPath(card.mediaType, card.tmdbId))} />}
				className={styles.masonry}
				columnClassName={styles.masonryColumn}
			/>
		</InfiniteScroll>
	);
}

/** Watch History (app WatchHistoryScreen): TV Shows | Movies, newest watch first, no tab bar */
export default function WatchHistoryScreen() {
	const navigate = useNavigate();
	const [tab, setTab] = useState<MediaType>(MediaType.TV);
	// +1 → new tab slides in from the right, -1 from the left
	const [dir, setDir] = useState(1);
	useHideTabBar();
	const index = TABS.findIndex((t) => t.key === tab);
	const goTo = (next: number) => {
		if (next < 0 || next >= TABS.length || next === index) return;
		setDir(next > index ? 1 : -1);
		setTab(TABS[next].key);
	};

	// Opened directly (no history entry) → back goes to Profile
	const goBack = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate(Paths.PROFILE));

	return (
		<div>
			{/* layoutRoot: the tab pill's layout animation measures inside this sticky header,
			    not against the scrolled page (otherwise it jumps after scrolling) */}
			<motion.header layoutRoot className={styles.topBar}>
				<div className={styles.titleRow}>
					<CircleBackButton tone={CircleButtonTone.SURFACE_LIGHT} onClick={goBack} />
					<h1 className={styles.title}>Hall of Shame</h1>
					{/* Mirrors the back button so the title is centred on the bar */}
					<CircleButtonSpacer />
				</div>
				<SlidingTabs id="history-tabs" tabs={TABS} activeKey={tab} onTabPress={(key) => goTo(TABS.findIndex((t) => t.key === key))} className={styles.tabs} />
			</motion.header>
			{/* Swipe left/right between TV Shows and Movies (vertical scroll stays native) */}
			<AnimatePresence mode="wait" initial={false} custom={dir}>
				<motion.div
					key={tab}
					custom={dir}
					initial={{ x: `${dir * 30}%`, opacity: 0 }}
					animate={{ x: 0, opacity: 1 }}
					exit={{ x: `${dir * -30}%`, opacity: 0 }}
					transition={{ duration: 0.18 }}
					drag="x"
					dragDirectionLock
					dragConstraints={{ left: 0, right: 0 }}
					dragElastic={0.2}
					className="touch-pan-y"
					onDragEnd={(_, info) => {
						if (info.offset.x < -SWIPE_PX) goTo(index + 1);
						else if (info.offset.x > SWIPE_PX) goTo(index - 1);
					}}
				>
					<HistoryList mediaType={tab} />
				</motion.div>
			</AnimatePresence>
		</div>
	);
}
