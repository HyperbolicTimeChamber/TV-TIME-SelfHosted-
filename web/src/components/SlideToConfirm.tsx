import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type PointerEvent,
	type KeyboardEvent,
} from "react";
import { Spin } from "antd";
import { IoChevronForward } from "react-icons/io5";
import styles from "./styles/SlideToConfirm.module.scss";

/** Track height, thumb-sized; the knob sits inside it with KNOB_INSET all round */
const TRACK_H = 64;
const KNOB_INSET = 5;
const KNOB = TRACK_H - KNOB_INSET * 2;
/** Past this share of the travel a release confirms */
const CONFIRM_AT = 0.85;
/** A flick this fast (px/s) confirms from half way — a quick swipe is enough */
const FLICK_VELOCITY = 800;
const FLICK_FROM = 0.5;
/** The fill trails the knob, lighter, fading in as it moves (at rest it read as a ring) */
const FILL_OPACITY = 0.35;
/** Only the last moves count for the release speed */
const VELOCITY_WINDOW_MS = 100;

interface Props {
	label: string;
	/** The track fills with it as the knob travels */
	color: string;
	onConfirm: () => void;
	/** The action is running: the knob holds at the end with a spinner */
	loading?: boolean;
}

/**
 * Slide to confirm (app SlideToConfirm; the pause / remove drawers): drag the knob to the end — or
 * flick it — to run the action. A release short of the line eases home. Enter / Space confirms too.
 * The knob moves by direct style writes (no React state per frame).
 */
export default function SlideToConfirm({ label, color, onConfirm, loading = false }: Props) {
	const trackRef = useRef<HTMLDivElement>(null);
	const knobRef = useRef<HTMLDivElement>(null);
	const fillRef = useRef<HTMLDivElement>(null);
	const labelRef = useRef<HTMLSpanElement>(null);
	const [dragging, setDragging] = useState(false);
	const drag = useRef({ active: false, startX: 0, startPos: 0, pos: 0, done: false, armed: false });
	const moves = useRef<{ x: number; t: number }[]>([]);

	const maxTravel = () => {
		const w = trackRef.current?.clientWidth ?? 0;
		return Math.max(0, w - KNOB - KNOB_INSET * 2);
	};

	/** Write the knob position straight to the DOM */
	const place = useCallback((pos: number) => {
		const max = maxTravel();
		drag.current.pos = pos;
		if (knobRef.current) knobRef.current.style.transform = `translateX(${pos}px)`;
		if (fillRef.current) {
			fillRef.current.style.width = `${pos + KNOB + KNOB_INSET * 2}px`;
			fillRef.current.style.opacity = String(Math.min(1, pos / KNOB) * FILL_OPACITY);
		}
		if (labelRef.current) {
			// The words give way as the knob covers them (gone at 60% of the travel)
			labelRef.current.style.opacity = max > 0 ? String(Math.max(0, 1 - pos / (max * 0.6))) : "1";
		}
	}, []);

	const setMode = (mode: "snap" | "finish" | "drag") => {
		const knob = knobRef.current;
		const fill = fillRef.current;
		const text = labelRef.current;
		if (!knob || !fill || !text) return;
		knob.classList.toggle(styles.snap, mode === "snap");
		knob.classList.toggle(styles.finish, mode === "finish");
		fill.classList.toggle(styles.snapFill, mode === "snap");
		fill.classList.toggle(styles.finishFill, mode === "finish");
		text.classList.toggle(styles.labelSnap, mode !== "drag");
	};

	const confirm = () => {
		if (navigator.vibrate) navigator.vibrate(10);
		onConfirm();
	};

	// Held at the end while the action runs; back to the start when it failed without closing the drawer
	useEffect(() => {
		const d = drag.current;
		if (loading) {
			d.done = true;
			setMode("finish");
			place(maxTravel());
		} else if (d.done) {
			d.done = false;
			setMode("snap");
			place(0);
		}
	}, [loading, place]);

	const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
		// The BottomSheet's drag must not start from the knob
		e.stopPropagation();
		const d = drag.current;
		if (loading || d.done || maxTravel() <= 0) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		d.active = true;
		d.startX = e.clientX;
		d.startPos = d.pos;
		d.armed = false;
		moves.current = [{ x: e.clientX, t: e.timeStamp }];
		setMode("drag");
		setDragging(true);
	};

	const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
		const d = drag.current;
		if (!d.active) return;
		const max = maxTravel();
		place(Math.min(max, Math.max(0, d.startPos + e.clientX - d.startX)));
		// One tick when crossing the confirm line: a release there counts (app parity)
		const past = d.pos >= max * CONFIRM_AT;
		if (past !== d.armed) {
			d.armed = past;
			if (past && navigator.vibrate) navigator.vibrate(5);
		}
		const list = moves.current;
		list.push({ x: e.clientX, t: e.timeStamp });
		while (list.length > 2 && e.timeStamp - list[0].t > VELOCITY_WINDOW_MS) list.shift();
	};

	const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
		const d = drag.current;
		if (!d.active) return;
		d.active = false;
		setDragging(false);
		const max = maxTravel();
		const pos = Math.min(max, Math.max(0, d.startPos + e.clientX - d.startX));
		const list = moves.current;
		const first = list[0];
		const dt = first ? e.timeStamp - first.t : 0;
		const velocity = first && dt > 0 ? ((e.clientX - first.x) / dt) * 1000 : 0;
		const share = max > 0 ? pos / max : 0;
		if (share >= CONFIRM_AT || (velocity > FLICK_VELOCITY && share >= FLICK_FROM)) {
			d.done = true;
			setMode("finish");
			place(max);
			confirm();
		} else {
			setMode("snap");
			place(0);
		}
	};

	const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		if (e.key !== "Enter" && e.key !== " ") return;
		e.preventDefault();
		if (loading || drag.current.done) return;
		drag.current.done = true;
		setMode("finish");
		place(maxTravel());
		confirm();
	};

	return (
		<div
			ref={trackRef}
			className={styles.track}
			role="button"
			tabIndex={0}
			aria-label={label}
			aria-disabled={loading}
			onKeyDown={onKeyDown}
		>
			<div
				ref={fillRef}
				className={styles.fill}
				style={{ background: color, opacity: 0, width: KNOB + KNOB_INSET * 2 }}
			/>
			<span ref={labelRef} className={styles.label}>
				{label}
			</span>
			<div
				ref={knobRef}
				className={`${styles.knob} ${dragging ? styles.dragging : ""}`}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
			>
				{/* The face scales a touch while held (press feedback); the knob itself only travels */}
				<span className={styles.face} style={{ background: color }}>
					{loading ? <Spin size="small" /> : <IoChevronForward size={26} />}
				</span>
			</div>
		</div>
	);
}
