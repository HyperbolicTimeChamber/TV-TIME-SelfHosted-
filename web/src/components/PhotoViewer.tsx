import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { IoOpenOutline } from "react-icons/io5";
import { useSubjectLink } from "@app/hooks/useSubjectLink";
import { tmdbLogoUri, tmdbPosterUri } from "@app/hooks/useTmdbImage";
import { PhotoSubjectKind } from "@app/enums";
import type { PhotoSubject } from "@app/types";
import styles from "./styles/PhotoViewer.module.scss";

const OPEN_S = 0.28;
const CLOSE_S = 0.22;
const EASE = [0.32, 0.72, 0, 1] as const;
/** A person's photo is a circle, like a profile picture; a studio's logo sits on a chip the row's shape */
const PERSON_ASPECT = 1;
const STUDIO_ASPECT = 2;
const WIDTH_SHARE = { [PhotoSubjectKind.PERSON]: 0.82, [PhotoSubjectKind.STUDIO]: 0.72 };
/** Wider windows keep it phone-sized */
const MAX_WIDTH_PX = 360;
const STUDIO_RADIUS = 20;
const PILL_H = 48;
const PILL_GAP = 16;
const EDGE_ROOM = 48;

const photoSrc = (subject: PhotoSubject, width: number) =>
	subject.kind === PhotoSubjectKind.STUDIO
		? tmdbLogoUri(subject.path, width)
		: tmdbPosterUri(subject.path, width);

function frameFor(kind: PhotoSubjectKind) {
	const aspect = kind === PhotoSubjectKind.STUDIO ? STUDIO_ASPECT : PERSON_ASPECT;
	const room = window.innerHeight - PILL_H - PILL_GAP - EDGE_ROOM * 2;
	const width = Math.min(window.innerWidth * WIDTH_SHARE[kind], MAX_WIDTH_PX, room * aspect);
	const height = width / aspect;
	return {
		width,
		height,
		left: (window.innerWidth - width) / 2,
		top: (window.innerHeight - height - PILL_GAP - PILL_H) / 2,
	};
}

/** The expanded photo + its name / link pill, grown out of the thumbnail that opened it */
function PhotoViewerContent({
	subject,
	origin,
	radius,
	thumbWidth,
	onClose,
}: {
	subject: PhotoSubject;
	origin: DOMRect;
	radius: number;
	thumbWidth: number;
	onClose: () => void;
}) {
	const { url, label, resolving } = useSubjectLink(subject);
	const [frame] = useState(() => frameFor(subject.kind));
	const studio = subject.kind === PhotoSubjectKind.STUDIO;
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const scale = Math.max(origin.width / frame.width, origin.height / frame.height);
	const closed = {
		x: origin.left + origin.width / 2 - (frame.left + frame.width / 2),
		y: origin.top + origin.height / 2 - (frame.top + frame.height / 2),
		scale,
		borderRadius: radius / scale,
		opacity: 0,
	};
	return (
		<>
			<motion.div
				className={styles.backdrop}
				initial={{ opacity: 0 }}
				animate={{ opacity: 1, transition: { duration: OPEN_S, ease: EASE } }}
				exit={{ opacity: 0, transition: { duration: CLOSE_S, ease: EASE } }}
				onClick={onClose}
			/>
			<motion.div
				className={`${styles.frame} ${studio ? styles.studioFrame : ""}`}
				style={frame as CSSProperties}
				initial={closed}
				animate={{
					x: 0,
					y: 0,
					scale: 1,
					borderRadius: studio ? STUDIO_RADIUS : frame.width / 2,
					opacity: 1,
					transition: { duration: OPEN_S, ease: EASE },
				}}
				exit={{ ...closed, transition: { duration: CLOSE_S, ease: EASE } }}
			>
				{/* The thumbnail (already cached) until the big one has loaded over it */}
				<img className={styles.photo} src={photoSrc(subject, thumbWidth)} alt="" />
				<img className={styles.photo} src={photoSrc(subject, frame.width)} alt={subject.name} />
			</motion.div>
			<motion.div
				className={styles.pillRow}
				style={{ top: frame.top + frame.height + PILL_GAP }}
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0, transition: { duration: OPEN_S, delay: OPEN_S / 2, ease: EASE } }}
				exit={{ opacity: 0, transition: { duration: CLOSE_S / 2 } }}
			>
				<a
					className={`${styles.pill} ${resolving ? styles.pillResolving : ""}`}
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={`${subject.name}, ${label}`}
				>
					<span className={styles.pillName}>{subject.name}</span>
					<span className={styles.pillDivider} />
					<span className={styles.pillLink}>{label}</span>
					<IoOpenOutline size={14} className={styles.pillLink} />
				</a>
			</motion.div>
		</>
	);
}

/**
 * A thumbnail (cast / crew photo, studio logo) that expands into the photo viewer on click, like a
 * profile picture in a chat app. Without a subject (no photo) it's just its children. App:
 * components/PhotoViewer
 */
export default function PhotoTrigger({
	subject,
	radius,
	thumbWidth,
	className,
	style,
	children,
}: {
	subject: PhotoSubject | null;
	/** The thumbnail's corner radius: the photo grows out of that shape */
	radius: number;
	/** The width the thumbnail asks TMDB for: already cached, shown until the big one lands */
	thumbWidth: number;
	className?: string;
	style?: CSSProperties;
	children: ReactNode;
}) {
	const [origin, setOrigin] = useState<DOMRect | null>(null);
	if (!subject) {
		return (
			<span className={className} style={style}>
				{children}
			</span>
		);
	}
	return (
		<>
			<button
				type="button"
				className={`${styles.trigger} ${className ?? ""}`}
				style={style}
				aria-label={`View ${subject.name}`}
				onClick={(e) => setOrigin(e.currentTarget.getBoundingClientRect())}
			>
				{children}
			</button>
			{createPortal(
				<AnimatePresence>
					{origin && (
						<PhotoViewerContent
							key="viewer"
							subject={subject}
							origin={origin}
							radius={radius}
							thumbWidth={thumbWidth}
							onClose={() => setOrigin(null)}
						/>
					)}
				</AnimatePresence>,
				document.body,
			)}
		</>
	);
}
