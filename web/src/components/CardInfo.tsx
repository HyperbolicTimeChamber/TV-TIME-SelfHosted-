import type { ReactNode } from "react";
import styles from "./styles/ShowCard.module.scss";

interface Props {
	/** The title pill (a button on active cards, muted on watched ones) */
	pill: ReactNode;
	/** The middle line: "S02 | E10" with its tags, or a movie's tags */
	children: ReactNode;
	/** The bottom line: episode name or a movie's director */
	subline?: string | null;
	/** Episode names may wrap to two lines; directors stay on one */
	twoLineSubline?: boolean;
	sublineClassName?: string;
	className?: string;
}

/**
 * Text column of the watchlist and Upcoming cards (app `components/CardInfo`): title pill,
 * middle line and subline, equally spaced and centred. The card has a fixed height, so a two-line
 * episode name shrinks both gaps evenly instead of growing the card.
 */
export default function CardInfo({
	pill,
	children,
	subline,
	twoLineSubline = false,
	sublineClassName = "",
	className = "",
}: Props) {
	return (
		<div className={`${styles.info} ${className}`}>
			{pill}
			<span className={styles.lineGap} />
			<div className={styles.middleLine}>{children}</div>
			{subline && (
				<>
					<span className={`${styles.lineGap} ${styles.sublineGap}`} />
					<span
						className={`${styles.subline} ${twoLineSubline ? styles.subline2 : ""} ${sublineClassName}`}
					>
						{subline}
					</span>
				</>
			)}
		</div>
	);
}
