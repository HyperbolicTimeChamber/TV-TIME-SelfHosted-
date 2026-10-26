import { useMemo } from "react";
import { Spin } from "antd";
import { tmdbBackdropUri, tmdbPosterUri } from "@app/hooks/useTmdbImage";
import { collageColumns, generateCollageLayout } from "@app/utils/collageLayout";
import styles from "./styles/ProfileScreen.module.scss";
import { useCountUp } from "@app/hooks/useCountUp";
import { cssVars } from "../../utils/cssVars";

interface CardProps {
	value: number;
	/** Applied to every counted frame, so the card keeps its "26.1K" / "1y 265d" shape */
	format: (value: number) => string;
	label: string;
	flex: number;
	align?: "left" | "right";
	loading?: boolean;
}

/** Counts up from zero each time the page shows (the app does it once per launch) */
function CardBody({
	value,
	format,
	label,
	loading,
}: Pick<CardProps, "value" | "format" | "label" | "loading">) {
	const shown = useCountUp(value, !loading);
	return (
		<>
			<span className={styles.statLabel}>{label}</span>
			{loading ? (
				<Spin size="small" className={styles.statLoader} />
			) : (
				<span className={styles.statNumber}>{format(shown)}</span>
			)}
		</>
	);
}

/** Stat card with blurred backdrop (app StatCard) */
export function StatCard({ backdrop, ...p }: CardProps & { backdrop?: string | null }) {
	return (
		<div
			className={`${styles.statCard} flex-(--flex)! ${p.align === "right" ? "items-end!" : "items-start!"}`}
			style={cssVars({ "--flex": p.flex })}
		>
			{backdrop && <img src={tmdbBackdropUri(backdrop, 400)} alt="" className={styles.cardBg} />}
			{backdrop && <div className={styles.cardOverlay} />}
			<CardBody {...p} />
		</div>
	);
}

const SCATTER_THRESHOLD = 10;
/** A scattered poster's width against its layout column. Columns sit 1.1 apart, so a bit past
 *  that overlaps its neighbours and the pile reads as solid at any card width */
const SCATTER_COVER = 1.3;
/** Widest a scattered poster gets (desktop cards), for the image size to fetch */
const SCATTER_MAX_W = 160;

/** Poster collage card — grid for few posters, scattered pile for many (app CollageCard) */
export function CollageCard({
	posters = [],
	seed = 42,
	...p
}: CardProps & { posters?: string[]; seed?: number }) {
	const scattered = posters.length >= SCATTER_THRESHOLD;
	const layout = useMemo(
		() => (scattered ? generateCollageLayout(posters.length, seed) : []),
		[posters.length, seed, scattered],
	);
	// Grows with the card, so a wide one isn't phone-sized posters with dark gaps between
	const scatterWidth = `${(100 / collageColumns(posters.length)) * SCATTER_COVER}%`;
	const cols =
		posters.length <= 2 ? posters.length : posters.length <= 5 ? Math.ceil(posters.length / 2) : 3;
	const rows = Math.ceil(posters.length / Math.max(cols, 1));

	return (
		<div
			className={`${styles.statCard} flex-(--flex)! ${p.align === "right" ? "items-end!" : "items-start!"}`}
			style={cssVars({ "--flex": p.flex })}
		>
			{posters.length > 0 &&
				(scattered ? (
					<div className={styles.collage}>
						{posters.map((path, i) => (
							<img
								key={i}
								src={tmdbPosterUri(path, SCATTER_MAX_W)}
								alt=""
								className={`${styles.scatterPoster} w-(--w)! top-(--top)! left-(--left)! z-(--z)! rotate-(--rot)!`}
								style={cssVars({
									"--w": scatterWidth,
									"--left": `${layout[i].left}%`,
									"--top": `${layout[i].top}%`,
									"--rot": `${layout[i].rotate}deg`,
									"--z": layout[i].zIndex,
								})}
							/>
						))}
					</div>
				) : (
					<div className={styles.collageGrid}>
						{posters.map((path, i) => (
							<img
								key={i}
								src={tmdbPosterUri(path, 55)}
								alt=""
								className="h-(--h) w-(--w) object-cover"
								style={cssVars({ "--w": `${100 / cols}%`, "--h": `${100 / rows}%` })}
							/>
						))}
					</div>
				))}
			{posters.length > 0 && <div className={styles.cardOverlay} />}
			<CardBody {...p} />
		</div>
	);
}
