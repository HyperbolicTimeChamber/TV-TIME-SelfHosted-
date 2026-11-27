import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { App as AntApp, Spin } from "antd";
import { IoArrowBack, IoImagesOutline, IoPencil, IoPerson } from "react-icons/io5";
import { useLocalProfileStore } from "@app/stores/localProfileStore";
import { PhotoReadError, readProfilePhoto } from "../../platform/profilePhoto";
import styles from "./styles/ProfilePhotoViewer.module.scss";

const OPEN_S = 0.28;
const CLOSE_S = 0.22;
const EASE = [0.32, 0.72, 0, 1] as const;
/** Wider windows keep it phone-sized */
const MAX_PHOTO_PX = 480;
/** Header and footer room left around the photo */
const CHROME_PX = 190;

const ERRORS: Record<PhotoReadError, string> = {
	[PhotoReadError.TOO_LARGE]: "That picture is too big. Choose one under 15 MB.",
	[PhotoReadError.UNREADABLE]: "Couldn't use that picture. Try another one.",
};

interface ContentProps {
	uid: string;
	name: string;
	/** The picture shown; null = none yet */
	src: string | null;
	/** A photo chosen in this browser is set */
	canRemove: boolean;
	/** The avatar's place on screen */
	origin: DOMRect;
	onClose: () => void;
}

function Viewer({ uid, name, src, canRemove, origin, onClose }: ContentProps) {
	const { message } = AntApp.useApp();
	const input = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const [frame] = useState(() => {
		const size = Math.min(window.innerWidth, MAX_PHOTO_PX, window.innerHeight - CHROME_PX);
		return {
			width: size,
			height: size,
			left: (window.innerWidth - size) / 2,
			top: (window.innerHeight - size) / 2,
		};
	});
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const choose = async (file: File | undefined) => {
		if (!file) return;
		setBusy(true);
		const read = await readProfilePhoto(file);
		if (!read.ok) message.error(ERRORS[read.reason]);
		else if (!(await useLocalProfileStore.getState().save(uid, { photo: read.dataUrl }))) {
			message.error("This browser has no room to save the picture.");
		}
		setBusy(false);
	};

	// A circle on the avatar, a square once open
	const closed = {
		x: origin.left + origin.width / 2 - (frame.left + frame.width / 2),
		y: origin.top + origin.height / 2 - (frame.top + frame.height / 2),
		scale: origin.width / frame.width,
		borderRadius: frame.width / 2,
	};
	const fade = {
		initial: { opacity: 0 },
		animate: { opacity: 1, transition: { duration: OPEN_S, ease: EASE } },
		exit: { opacity: 0, transition: { duration: CLOSE_S, ease: EASE } },
	};

	return (
		<div role="dialog" aria-modal="true" aria-label={`${name}'s profile photo`}>
			<motion.div className={styles.backdrop} {...fade} onClick={onClose} />
			<motion.div className={styles.header} {...fade}>
				<button type="button" className={styles.headerButton} onClick={onClose} aria-label="Back">
					<IoArrowBack size={24} />
				</button>
				<span className={styles.name}>{name}</span>
				<button
					type="button"
					className={styles.headerButton}
					onClick={() => input.current?.click()}
					disabled={busy}
					aria-label="Change photo"
				>
					{busy ? <Spin size="small" /> : <IoPencil size={22} />}
				</button>
			</motion.div>
			<motion.div
				className={styles.frame}
				style={frame}
				initial={closed}
				animate={{
					x: 0,
					y: 0,
					scale: 1,
					borderRadius: 0,
					transition: { duration: OPEN_S, ease: EASE },
				}}
				exit={{ ...closed, opacity: 0, transition: { duration: CLOSE_S, ease: EASE } }}
			>
				{src ? (
					<img className={styles.photo} src={src} alt="" referrerPolicy="no-referrer" />
				) : (
					<IoPerson size={frame.width / 2} color="var(--text-muted)" />
				)}
			</motion.div>
			<motion.div className={styles.footer} {...fade}>
				<button
					type="button"
					className={styles.primary}
					onClick={() => input.current?.click()}
					disabled={busy}
				>
					<IoImagesOutline size={18} />
					{src ? "Change Photo" : "Add Photo"}
				</button>
				{canRemove && (
					<button
						type="button"
						className={styles.secondary}
						onClick={() => void useLocalProfileStore.getState().save(uid, { photo: null })}
						disabled={busy}
					>
						Remove Photo
					</button>
				)}
				<span className={styles.note}>Saved in this browser only.</span>
			</motion.div>
			<input
				ref={input}
				type="file"
				accept="image/*"
				hidden
				data-testid="profile-photo-input"
				onChange={(e) => {
					const file = e.target.files?.[0];
					// Same file twice in a row must still fire change
					e.target.value = "";
					void choose(file);
				}}
			/>
		</div>
	);
}

/** The profile photo, full screen, grown out of the avatar (app ProfilePhotoViewer) */
export default function ProfilePhotoViewer({
	origin,
	...props
}: Omit<ContentProps, "origin"> & { origin: DOMRect | null }) {
	return createPortal(
		<AnimatePresence>
			{origin && <Viewer key="photo" origin={origin} {...props} />}
		</AnimatePresence>,
		document.body,
	);
}
