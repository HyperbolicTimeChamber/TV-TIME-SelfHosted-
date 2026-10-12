import { useEffect, useRef } from "react";
import { spinnerShape } from "../theme/index";
import { cssVars, px } from "../utils/cssVars";

const { size: SIZE, dots: DOTS, spinMs, tilt } = spinnerShape;
const TILT_MS = tilt[tilt.length - 1][0];

/** The app's loading spinner: spotted ball with a hat, spinning while it rocks */
export default function LoadingSpinner() {
	const tiltRef = useRef<HTMLDivElement>(null);
	const ballRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		// Keyframes come from the shared spinnerShape so web + app animate identically
		const spin = ballRef.current?.animate?.(
			[{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
			{ duration: spinMs, iterations: Infinity, easing: "linear" },
		);
		const rock = tiltRef.current?.animate?.(
			tilt.map(([ms, deg]) => ({ transform: `rotate(${deg}deg)`, offset: ms / TILT_MS })),
			{ duration: TILT_MS, iterations: Infinity, easing: "ease" },
		);
		return () => {
			spin?.cancel();
			rock?.cancel();
		};
	}, []);

	return (
		<div className="flex items-center justify-center p-2" role="progressbar" aria-label="Loading">
			<div ref={tiltRef} className="rotate-(--tilt0)" style={cssVars({ "--tilt0": `${tilt[0][1]}deg`, "--s": px(SIZE) })}>
				{/* Hat */}
				<div className="mx-auto -mb-px h-[calc(var(--s)/4)] w-[calc(var(--s)/2)] rounded-t-(--s) bg-spinner-white" />
				{/* Ball */}
				<div ref={ballRef} className="relative size-(--s) overflow-hidden rounded-full bg-spinner-white">
					{DOTS.map((dot, i) => (
						<span
							key={i}
							className="absolute top-(--y) left-(--x) size-(--d) rounded-full bg-spinner-orange"
							style={cssVars({ "--d": px(dot.r * 2), "--x": px(dot.cx - dot.r), "--y": px(dot.cy - dot.r) })}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
