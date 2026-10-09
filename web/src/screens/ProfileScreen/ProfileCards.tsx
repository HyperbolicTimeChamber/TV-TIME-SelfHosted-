import { useMemo } from "react";
import { Spin } from "antd";
import { tmdbBackdropUri, tmdbPosterUri } from "@app/hooks/useTmdbImage";
import { generateCollageLayout } from "@app/utils/collageLayout";
import styles from "./ProfileScreen.module.css";

interface CardProps {
	value: string | number;
	label: string;
	flex: number;
	align?: "left" | "right";
	loading?: boolean;
}

function CardBody({ value, label, loading }: Pick<CardProps, "value" | "label" | "loading">) {
	return (
		<>
			<span className={styles.statLabel}>{label}</span>
			{loading ? <Spin size="small" className={styles.statLoader} /> : <span className={styles.statNumber}>{value}</span>}
		</>
	);
}

/** Stat card with blurred backdrop (app StatCard) */
export function StatCard({ backdrop, ...p }: CardProps & { backdrop?: string | null }) {
	return (
		<div className={styles.statCard} style={{ flex: p.flex, alignItems: p.align === "right" ? "flex-end" : "flex-start" }}>
			{backdrop && <img src={tmdbBackdropUri(backdrop, 400)} alt="" className={styles.cardBg} />}
			{backdrop && <div className={styles.cardOverlay} />}
			<CardBody {...p} />
		</div>
	);
}

const SCATTER_THRESHOLD = 10;

/** Poster collage card — grid for few posters, scattered pile for many (app CollageCard) */
export function CollageCard({ posters = [], seed = 42, ...p }: CardProps & { posters?: string[]; seed?: number }) {
	const scattered = posters.length >= SCATTER_THRESHOLD;
	const layout = useMemo(() => (scattered ? generateCollageLayout(posters.length, seed) : []), [posters.length, seed, scattered]);
	const cols = posters.length <= 2 ? posters.length : posters.length <= 5 ? Math.ceil(posters.length / 2) : 3;
	const rows = Math.ceil(posters.length / Math.max(cols, 1));

	return (
		<div className={styles.statCard} style={{ flex: p.flex, alignItems: p.align === "right" ? "flex-end" : "flex-start" }}>
			{posters.length > 0 &&
				(scattered ? (
					<div className={styles.collage}>
						{posters.map((path, i) => (
							<img
								key={i}
								src={tmdbPosterUri(path, 55)}
								alt=""
								className={styles.scatterPoster}
								style={{
									left: `${layout[i].left}%`,
									top: `${layout[i].top}%`,
									transform: `rotate(${layout[i].rotate}deg)`,
									zIndex: layout[i].zIndex,
								}}
							/>
						))}
					</div>
				) : (
					<div className={styles.collageGrid}>
						{posters.map((path, i) => (
							<img key={i} src={tmdbPosterUri(path, 55)} alt="" style={{ width: `${100 / cols}%`, height: `${100 / rows}%`, objectFit: "cover" }} />
						))}
					</div>
				))}
			{posters.length > 0 && <div className={styles.cardOverlay} />}
			<CardBody {...p} />
		</div>
	);
}
