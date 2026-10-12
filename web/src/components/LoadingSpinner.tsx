import { useEffect, useRef } from "react";
import { colors, spinnerShape } from "../theme";

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
		<div style={{ padding: 8, display: "flex", justifyContent: "center", alignItems: "center" }} role="progressbar" aria-label="Loading">
			<div ref={tiltRef} style={{ transform: `rotate(${tilt[0][1]}deg)` }}>
				{/* Hat */}
				<div
					style={{
						width: SIZE / 2,
						height: SIZE / 4,
						background: colors.spinnerWhite,
						borderRadius: `${SIZE}px ${SIZE}px 0 0`,
						margin: "0 auto -1px",
					}}
				/>
				{/* Ball */}
				<div
					ref={ballRef}
					style={{
						position: "relative",
						width: SIZE,
						height: SIZE,
						borderRadius: SIZE / 2,
						background: colors.spinnerWhite,
						overflow: "hidden",
					}}
				>
					{DOTS.map((dot, i) => (
						<span
							key={i}
							style={{
								position: "absolute",
								width: dot.r * 2,
								height: dot.r * 2,
								borderRadius: dot.r,
								left: dot.cx - dot.r,
								top: dot.cy - dot.r,
								background: colors.spinnerOrange,
							}}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
