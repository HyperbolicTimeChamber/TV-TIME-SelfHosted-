import { useEffect, useMemo, useState } from "react";
import { WhereToWatchCompact, WhereToWatchPlacement } from "./WhereToWatch";
import { formatIsoDate } from "@app/utils/format";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Spin } from "antd";
import { IoBookmark, IoBookmarkOutline } from "react-icons/io5";
import type { ShowDrawerData } from "@app/types";
import { tmdbBackdropUri, tmdbLogoUri, tmdbPosterUri } from "@app/hooks/useTmdbImage";
import { useTitleLogo } from "@app/hooks/useTitleLogo";
import { useCustomLists } from "@app/hooks/useCustomLists";
import { isTitleListed } from "@app/utils/customLists";
import { useAppSelector } from "../store";
import styles from "./styles/ShowDrawer.module.scss";
import SkeletonBlock from "./SkeletonBlock";
import AddToListSheet from "./AddToListSheet";
import type { IconType } from "react-icons";
import { SheetGroup, SheetOption } from "./BottomSheet";
import { colors } from "../theme";

/** An extra row under "Go to Show" (app ShowDrawerAction): the list page's Add / Share / Remove */
export interface ShowDrawerAction {
	key: string;
	label: string;
	/** Second line under the label */
	hint?: string;
	icon: IconType;
	destructive?: boolean;
	onClick: () => void;
}

interface Props {
	visible: boolean;
	show: ShowDrawerData | null;
	loading?: boolean;
	onGoToShow?: () => void;
	/** Extra rows under the Go to button (the list page's Add to another list / Remove / Export) */
	actions?: ShowDrawerAction[];
	onClose: () => void;
}

/** Bottom sheet with show summary (app ShowDrawer); drag down to close */
/** Wait this long for the logo before showing the name (app NAME_DELAY_MS) */
const NAME_DELAY_MS = 2000;

/** The title's logo, its name when TMDB has none (or after NAME_DELAY_MS still loading), in a fixed
 *  slot (app DrawerTitle). Keyed per title: the wait restarts for each one */
function DrawerTitle({ show }: { show: ShowDrawerData }) {
	const logoPath = useTitleLogo(undefined, show.tmdbId, show.mediaType);
	const [waited, setWaited] = useState(false);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		const t = window.setTimeout(() => setWaited(true), NAME_DELAY_MS);
		return () => window.clearTimeout(t);
	}, []);
	const showLogo = !!logoPath && !failed;
	const showName = logoPath === null || failed || (!logoPath && waited);
	return (
		<div className={styles.titleSlot}>
			{showLogo ? (
				<img
					src={tmdbLogoUri(logoPath, 260)}
					alt={show.title}
					className={styles.titleLogo}
					onError={() => setFailed(true)}
				/>
			) : (
				showName && <h2 className={styles.title}>{show.title}</h2>
			)}
		</div>
	);
}

export default function ShowDrawer({
	visible,
	show,
	loading,
	onGoToShow,
	actions,
	onClose,
}: Props) {
	const [imageLoaded, setImageLoaded] = useState(false);
	// "Add to List": needs to know which title this is, and a signed-in user to own the list
	const userId = useAppSelector((s) => s.auth.user?.uid);
	const { lists } = useCustomLists(userId);
	const [listSheetOpen, setListSheetOpen] = useState(false);
	const listEntry = useMemo(
		() =>
			show?.tmdbId && show.mediaType
				? {
						tmdbId: show.tmdbId,
						mediaType: show.mediaType,
						title: show.title,
						posterPath: show.posterPath,
					}
				: null,
		[show?.tmdbId, show?.mediaType, show?.title, show?.posterPath],
	);
	const isListed = !!listEntry && isTitleListed(lists, listEntry.tmdbId, listEntry.mediaType);
	const meta = [
		// A movie's full release date ("16 Jul 2024"); a show's first-air year
		show?.releaseDate ? formatIsoDate(show.releaseDate) : show?.year,
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

	return (
		<>
			{createPortal(
				<AnimatePresence onExitComplete={() => setImageLoaded(false)}>
					{visible && (
						<motion.div
							className={styles.overlay}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							onClick={onClose}
						>
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
											{!imageLoaded && <SkeletonBlock className={styles.imageSkeleton} />}
											{image && (
												<img
													src={image}
													alt=""
													className={styles.backdrop}
													onLoad={() => setImageLoaded(true)}
												/>
											)}
											<div className={styles.imageGradient} />
											{/* With list actions below ("Add to another list"), the corner button would say it twice */}
											{userId && listEntry && !actions?.length && (
												<button
													className={`${styles.listButton} ${isListed ? styles.listButtonActive : ""}`}
													onClick={() => setListSheetOpen(true)}
													aria-label="Add to List"
												>
													{isListed ? <IoBookmark size={18} /> : <IoBookmarkOutline size={18} />}
												</button>
											)}
										</div>
										<div className={styles.content}>
											<DrawerTitle key={`${show.mediaType}_${show.tmdbId}`} show={show} />
											{meta && <p className={styles.meta}>{meta}</p>}
											<div className={styles.genreRow}>
												{show.genres == null ? (
													<SkeletonBlock className={`${styles.skeleton} ${styles.skeletonShort}`} />
												) : (
													show.genres && <span className={styles.meta}>{show.genres}</span>
												)}
												{show.mediaType && (
													<span
														className={`${styles.typeBadge} ${show.mediaType === "movie" ? styles.typeBadgeMovie : ""}`}
													>
														{show.mediaType === "movie" ? "MOVIE" : "TV"}
													</span>
												)}
											</div>
											{show.overview === null ? (
												<div className={styles.overviewSkeleton}>
													<SkeletonBlock className={styles.skeleton} />
													<SkeletonBlock className={`${styles.skeleton} w-[95%]!`} />
													<SkeletonBlock className={`${styles.skeleton} w-[60%]!`} />
												</div>
											) : (
												show.overview && <p className={styles.overview}>{show.overview}</p>
											)}
											{/* The info page's Where to Watch, fitted to the drawer (nothing when none) */}
											{show.tmdbId != null && show.mediaType && (
												<WhereToWatchCompact
													tmdbId={show.tmdbId}
													mediaType={show.mediaType}
													title={show.title}
													placement={WhereToWatchPlacement.DRAWER}
												/>
											)}
										</div>
										{onGoToShow && (
											<button className={styles.goToShow} onClick={onGoToShow}>
												{show.mediaType === "movie" ? "Go to Movie" : "Go to Show"}
											</button>
										)}
										{actions?.length ? (
											// The app's sheet style: everyday actions in one card, destructive ones in their own
											<div className={styles.actions}>
												{[
													actions.filter((a) => !a.destructive),
													actions.filter((a) => a.destructive),
												]
													.filter((group) => group.length > 0)
													.map((group, i) => (
														<SheetGroup key={i}>
															{group.map((a) => (
																<SheetOption
																	key={a.key}
																	icon={a.icon}
																	color={a.destructive ? colors.destructiveRed : colors.accent}
																	title={a.label}
																	hint={a.hint}
																	destructive={a.destructive}
																	onClick={a.onClick}
																/>
															))}
														</SheetGroup>
													))}
											</div>
										) : null}
									</div>
								)}
							</motion.div>
						</motion.div>
					)}
				</AnimatePresence>,
				document.body,
			)}
			<AddToListSheet
				entry={listSheetOpen ? listEntry : null}
				onClose={() => setListSheetOpen(false)}
			/>
		</>
	);
}
