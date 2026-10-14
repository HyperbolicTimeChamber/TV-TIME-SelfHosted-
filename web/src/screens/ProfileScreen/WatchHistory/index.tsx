import { useState } from "react";
import { motion } from "motion/react";
import { IoChevronBack } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import InfiniteScroll from "react-infinite-scroll-component";
import { useWatchHistory } from "@app/hooks/useWatchHistory";
import { MediaType } from "@app/enums";
import SlidingTabs from "../../../components/SlidingTabs";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { useHideTabBar } from "../../../hooks/useHideTabBar";
import { Paths, showPath } from "../../../routes/paths";
import HistoryCard from "./HistoryCard";
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
			<div className={styles.grid}>
				{cards.map((card) => (
					<HistoryCard key={card.id} card={card} onClick={() => navigate(showPath(card.mediaType, card.tmdbId))} />
				))}
			</div>
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
					<button className={styles.backButton} onClick={goBack} aria-label="Back">
						<IoChevronBack size={24} />
					</button>
					<h1 className={styles.title}>Watch History</h1>
				</div>
				<SlidingTabs id="history-tabs" tabs={TABS} activeKey={tab} onTabPress={setTab} />
			</motion.header>
			<HistoryList key={tab} mediaType={tab} />
		</div>
	);
}
