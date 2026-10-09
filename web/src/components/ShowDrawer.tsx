import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Spin } from "antd";
import type { ShowDrawerData } from "@app/types";
import { tmdbBackdropUri, tmdbPosterUri } from "@app/hooks/useTmdbImage";
import styles from "./ShowDrawer.module.css";

interface Props {
	visible: boolean;
	show: ShowDrawerData | null;
	loading?: boolean;
	onGoToShow?: () => void;
	onClose: () => void;
}

/** Bottom sheet with show summary (app ShowDrawer); drag down to close */
export default function ShowDrawer({ visible, show, loading, onGoToShow, onClose }: Props) {
	const [imageLoaded, setImageLoaded] = useState(false);
	const meta = [
		show?.year,
		show?.totalSeasons ? `${show.totalSeasons} season${show.totalSeasons !== 1 ? "s" : ""}` : null,
		show?.totalEpisodes ? `${show.totalEpisodes} episodes` : null,
		show?.runtime ? `${show.runtime} min` : null,
	]
		.filter(Boolean)
		.join(" · ");
	const image = show?.backdropPath
		? tmdbBackdropUri(show.backdropPath, 780)
		: show?.posterPath
			? tmdbPosterUri(show.posterPath, 780)
			: null;

	return createPortal(
		<AnimatePresence onExitComplete={() => setImageLoaded(false)}>
			{visible && (
				<motion.div className={styles.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
					<motion.div
						className={styles.sheet}
						role="dialog"
						aria-label={show?.title}
						initial={{ y: "100%" }}
						animate={{ y: 0, transition: { type: "spring", damping: 26, stiffness: 260 } }}
						exit={{ y: "100%", transition: { duration: 0.2 } }}
						drag="y"
						dragConstraints={{ top: 0, bottom: 0 }}
						dragElastic={{ top: 0, bottom: 1 }}
						onDragEnd={(_, info) => (info.offset.y > 100 || info.velocity.y > 500) && onClose()}
						onClick={(e) => e.stopPropagation()}
					>
						<div className={styles.handle} />
						{loading || !show ? (
							<div className={styles.loading}>
								<Spin size="large" />
							</div>
						) : (
							<div className={styles.scroll}>
								<div className={styles.imageContainer}>
									{!imageLoaded && <div className={styles.imageSkeleton} />}
									{image && <img src={image} alt="" className={styles.backdrop} onLoad={() => setImageLoaded(true)} />}
									<div className={styles.imageGradient} />
								</div>
								<div className={styles.content}>
									<h2 className={styles.title}>{show.title}</h2>
									{meta && <p className={styles.meta}>{meta}</p>}
									<div className={styles.genreRow}>
										{show.genres == null ? (
											<span className={`${styles.skeleton} ${styles.skeletonShort}`} />
										) : (
											show.genres && <span className={styles.meta}>{show.genres}</span>
										)}
										{show.mediaType && (
											<span className={`${styles.typeBadge} ${show.mediaType === "movie" ? styles.typeBadgeMovie : ""}`}>
												{show.mediaType === "movie" ? "MOVIE" : "TV"}
											</span>
										)}
									</div>
									{show.overview === null ? (
										<div className={styles.overviewSkeleton}>
											<span className={styles.skeleton} />
											<span className={styles.skeleton} style={{ width: "95%" }} />
											<span className={styles.skeleton} style={{ width: "60%" }} />
										</div>
									) : (
										show.overview && <p className={styles.overview}>{show.overview}</p>
									)}
								</div>
								{onGoToShow && (
									<button className={styles.goToShow} onClick={onGoToShow}>
										{show.mediaType === "movie" ? "Go to Movie" : "Go to Show"}
									</button>
								)}
							</div>
						)}
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body,
	);
}
