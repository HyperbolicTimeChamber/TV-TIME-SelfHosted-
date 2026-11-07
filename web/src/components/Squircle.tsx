import { SQUIRCLE_EXPONENT, superellipsePath } from "../utils/squircle";

/**
 * A superellipse ("squircle") background filling its parent (fill: --squircle-fill, default the
 * primary red). CSS border-radius only draws circular corners on straight sides, which read as a
 * plain rounded square
 */
export default function Squircle({ size }: { size: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			aria-hidden
			style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
		>
			<path
				d={superellipsePath(size, SQUIRCLE_EXPONENT)}
				fill="var(--squircle-fill, var(--primary))"
			/>
		</svg>
	);
}
