import { memo, useState } from "react";
import { Spin } from "antd";
import type { CarouselEpisode } from "@app/types";
import { tmdbBackdropUri, tmdbPosterUri, tmdbStillUri } from "@app/hooks/useTmdbImage";
import { formatDate } from "./helpers";
import styles from "./styles/EpisodeDetailModal.module.scss";
import SkeletonBlock from "../SkeletonBlock";

interface Props {
	ep: CarouselEpisode;
	showTitle: string;
	showPosterPath: string | null;
	showBackdropPath: string | null;
	isWatched: boolean;
	watchCount: number;
	isLoaded: boolean;
	isMarking: boolean;
	/** Green button text ("Mark as Watched" / "Mark 2nd Rewatch") */
	markLabel: string;
	/** Guests: info only, no watch buttons */
	readOnly?: boolean;
	onMarkWatched: () => void;
	onUnwatch: () => void;
	onRewatch: () => void;
	/** Rewatch only: move past this episode without watching it */
	onSkip?: () => void;
	onShowPress?: () => void;
}

export const CARD_IMG_WIDTH = 400;

function EpisodeCard(p: Props) {
	const [imageLoaded, setImageLoaded] = useState(false);
	const { ep } = p;
	const label = `S${String(ep.season).padStart(2, "0")} | E${String(ep.episode).padStart(2, "0")}`;

	if (!p.isLoaded) {
		return (
			<div className={styles.cardContent}>
				<SkeletonBlock className={styles.imageContainer} />
				<div className={styles.skeletonBody}>
					<SkeletonBlock className={styles.skeletonTitle} />
					<SkeletonBlock className={styles.skeletonLine} />
					<SkeletonBlock className={styles.skeletonLineShort} />
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
		<button
			className={`${styles.actionButton} ${styles.skipButton}`}
			onClick={p.onSkip}
			disabled={p.isMarking}
		>
			Skip
		</button>
	) : null;

	return (
		<div className={styles.cardContent}>
			<div className={styles.imageContainer}>
				{!imageLoaded && img && <SkeletonBlock className={styles.imageSkeleton} />}
				{img ? (
					<img
						src={img}
						alt=""
						className={`${styles.still} ${imageLoaded ? "opacity-100" : "opacity-0"}`}
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
				{ep.overview ? (
					<p className={styles.overview}>{ep.overview}</p>
				) : (
					<p className={`${styles.overview} ${styles.overviewEmpty}`}>
						No description available yet.
					</p>
				)}
			</div>

			{!p.readOnly &&
				(p.isWatched ? (
					<div className={styles.buttonRow}>
						<button
							className={`${styles.actionButton} ${styles.unwatchButton}`}
							onClick={p.onUnwatch}
							disabled={p.isMarking}
						>
							Unwatch
						</button>
						<button
							className={`${styles.actionButton} ${styles.rewatchButton}`}
							onClick={p.onRewatch}
							disabled={p.isMarking}
						>
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
					// Rewatch: Skip first, then "Mark Nth Rewatch"
					<div className={styles.buttonRow}>
						{skip}
						<button
							className={`${styles.actionButton} ${styles.watchButton}`}
							onClick={p.onMarkWatched}
							disabled={p.isMarking}
						>
							{p.isMarking ? <Spin size="small" /> : p.markLabel}
						</button>
					</div>
				))}
		</div>
	);
}

export default memo(EpisodeCard);
