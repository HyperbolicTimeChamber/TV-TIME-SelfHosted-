import { useState } from "react";
import { motion } from "motion/react";
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
	useHideTabBar();

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
				<SlidingTabs id="history-tabs" tabs={TABS} activeKey={tab} onTabPress={setTab} className={styles.tabs} />
			</motion.header>
			<HistoryList key={tab} mediaType={tab} />
		</div>
	);
}
