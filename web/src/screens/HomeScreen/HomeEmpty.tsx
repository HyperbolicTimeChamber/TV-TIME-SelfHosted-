import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "antd";
import { useNavigate } from "react-router-dom";
import { Paths } from "../../routes/paths";
import styles from "./styles/HomeScreen.module.scss";

/** TV-headed host art for the Home tabs' empty states */
export const WELCOME_ART = "/welcome.webp";
export const UPCOMING_EMPTY_ART = "/upcoming-empty.webp";
/** Snorlax, asleep — "all caught up" */
export const CAUGHT_UP_ART = "/caught-up.webp";

interface Props {
	art: string;
	/** Pixel-font headline */
	title: string;
	subtitle: string;
	tagline: string;
	/** Tablet / desktop width: show the art inside the streaming-overlay frame */
	framed?: boolean;
	/** Smaller, centred art (never edge to edge) — inline under a list section */
	compact?: boolean;
	/** Regular bold title instead of the pixel font (art that isn't a TV / glitch look) */
	plainTitle?: boolean;
}

/** Width of the widest rendered line in these elements (a wrapped line's box is wider than its text) */
function useWidestLine(refs: Array<React.RefObject<HTMLElement | null>>) {
	const [width, setWidth] = useState(0);
	useLayoutEffect(() => {
		const measure = () => {
			let max = 0;
			for (const ref of refs) {
				if (!ref.current) continue;
				const range = document.createRange();
				range.selectNodeContents(ref.current);
				// Missing in jsdom (tests) — the button just stays full width there
				const rects = range.getClientRects?.() ?? [];
				for (const rect of Array.from(rects)) max = Math.max(max, rect.width);
			}
			setWidth(Math.ceil(max));
		};
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		for (const ref of refs) if (ref.current) observer.observe(ref.current);
		return () => observer.disconnect();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	return width;
}

/** Home tab empty state: TV-host art, broadcast-style title, and the way to add shows (app HomeEmpty) */
export default function HomeEmpty({
	art,
	title,
	subtitle,
	tagline,
	framed = false,
	compact = false,
	plainTitle = false,
}: Props) {
	const navigate = useNavigate();
	const subtitleRef = useRef<HTMLParagraphElement>(null);
	const taglineRef = useRef<HTMLParagraphElement>(null);
	const textW = useWidestLine([subtitleRef, taglineRef]);
	return (
		<div className={`${styles.center} ${styles.welcome}`}>
			{/* Edge to edge on phones; inside the streaming-overlay frame from tablet width up */}
			<div
				className={`${styles.welcomeFrame} ${framed ? styles.welcomeFramed : ""} ${compact ? styles.welcomeCompact : ""}`}
			>
				<img className={styles.welcomeArt} src={art} alt="" />
			</div>
			{/* Long titles step down a size so they stay on two lines */}
			<h2
				className={
					plainTitle
						? styles.welcomeTitlePlain
						: `${styles.welcomeTitle} ${title.length > 12 ? styles.welcomeTitleLong : ""}`
				}
			>
				{title}
			</h2>
			{/* Shrink-wraps to the widest line, so the button matches the text width */}
			<div className={styles.welcomeText}>
				<p ref={subtitleRef} className={styles.welcomeSubtitle}>
					{subtitle}
				</p>
				<p ref={taglineRef} className={styles.welcomeTagline}>
					{tagline}
				</p>
				<Button
					type="primary"
					size="large"
					block
					className="self-center"
					style={textW ? { width: textW } : undefined}
					onClick={() => navigate(Paths.SEARCH)}
				>
					+ Add Shows & Movies
				</Button>
			</div>
		</div>
	);
}
