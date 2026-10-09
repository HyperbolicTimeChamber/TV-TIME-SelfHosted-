import { memo, useState } from "react";
import { Spin } from "antd";
import type { CarouselEpisode } from "@app/types";
import { tmdbBackdropUri, tmdbPosterUri, tmdbStillUri } from "@app/hooks/useTmdbImage";
import { formatDate } from "./helpers";
import styles from "./EpisodeDetailModal.module.css";

interface Props {
	ep: CarouselEpisode;
	showTitle: string;
	showPosterPath: string | null;
	showBackdropPath: string | null;
	isWatched: boolean;
	watchCount: number;
	isLoaded: boolean;
	isMarking: boolean;
	/** Guests: info only, no watch buttons */
	readOnly?: boolean;
	onMarkWatched: () => void;
	onUnwatch: () => void;
	onRewatch: () => void;
	/** Rewatch only: move past this episode without watching it */
	onSkip?: () => void;
	onShowPress?: () => void;
}

const CARD_IMG_WIDTH = 400;

function EpisodeCard(p: Props) {
	const [imageLoaded, setImageLoaded] = useState(false);
	const { ep } = p;
	const label = `S${String(ep.season).padStart(2, "0")} | E${String(ep.episode).padStart(2, "0")}`;

	if (!p.isLoaded) {
		return (
			<div className={styles.cardContent}>
				<div className={`${styles.imageContainer} ${styles.shimmer}`} />
				<div className={styles.skeletonBody}>
					<div className={`${styles.skeletonTitle} ${styles.shimmer}`} />
					<div className={`${styles.skeletonLine} ${styles.shimmer}`} />
					<div className={`${styles.skeletonLineShort} ${styles.shimmer}`} />
				</div>
			</div>
		);
	}

	const img = ep.stillPath
		? tmdbStillUri(ep.stillPath, CARD_IMG_WIDTH)
		: p.showBackdropPath
			? tmdbBackdropUri(p.showBackdropPath, CARD_IMG_WIDTH)
			: p.showPosterPath
				? tmdbPosterUri(p.showPosterPath, CARD_IMG_WIDTH)
				: null;

	const skip = p.onSkip ? (
		<button className={`${styles.actionButton} ${styles.skipButton}`} onClick={p.onSkip} disabled={p.isMarking}>
			Skip
		</button>
	) : null;

	return (
		<div className={styles.cardContent}>
			<div className={styles.imageContainer}>
				{!imageLoaded && img && <div className={`${styles.imageSkeleton} ${styles.shimmer}`} />}
				{img ? (
					<img
						src={img}
						alt=""
						className={styles.still}
						style={{ opacity: imageLoaded ? 1 : 0 }}
						onLoad={() => setImageLoaded(true)}
					/>
				) : (
					<div className={styles.stillPlaceholder}>E{String(ep.episode).padStart(2, "0")}</div>
				)}
				<div className={styles.imageGradient} />
			</div>

			<div className={styles.metaSection}>
				<button className={styles.titlePill} onClick={p.onShowPress} disabled={!p.onShowPress}>
					<span className={styles.titlePillText}>{p.showTitle.toUpperCase()}</span>
					{p.onShowPress && <span className={styles.titlePillArrow}>›</span>}
				</button>
				{ep.title && <p className={styles.episodeTitle}>{ep.title}</p>}
				<p className={styles.label}>{label}</p>
			</div>

			<div className={styles.overviewContainer}>
				<p className={styles.meta}>
					{ep.airDate ? formatDate(ep.airDate) : ""}
					{ep.runtime ? `${ep.airDate ? " · " : ""}${ep.runtime} min` : ""}
				</p>
				{ep.overview && <p className={styles.overview}>{ep.overview}</p>}
			</div>

			{!p.readOnly &&
				(p.isWatched ? (
					<div className={styles.buttonRow}>
						<button className={`${styles.actionButton} ${styles.unwatchButton}`} onClick={p.onUnwatch} disabled={p.isMarking}>
							Unwatch
						</button>
						<button className={`${styles.actionButton} ${styles.rewatchButton}`} onClick={p.onRewatch} disabled={p.isMarking}>
							{p.isMarking ? (
								<Spin size="small" />
							) : (
								<>
									Rewatch
									{p.watchCount > 1 && <span className={styles.buttonBadge}>{p.watchCount}</span>}
								</>
							)}
						</button>
						{skip}
					</div>
				) : (
					<div className={styles.buttonRow}>
						<button className={`${styles.actionButton} ${styles.watchButton}`} onClick={p.onMarkWatched} disabled={p.isMarking}>
							{p.isMarking ? <Spin size="small" /> : "Mark as Watched"}
						</button>
						{skip}
					</div>
				))}
		</div>
	);
}

export default memo(EpisodeCard);
