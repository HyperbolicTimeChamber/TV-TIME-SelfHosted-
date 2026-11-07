/** Superellipse exponent of the sort buttons' squircle (2 = a circle; higher = squarer) */
export const SQUIRCLE_EXPONENT = 4;
const POINTS = 72;

/**
 * SVG path of a superellipse filling a `size` square: |x|^n + |y|^n = r^n. Unlike rounded
 * corners (circular arcs joined to straight sides), the curvature never jumps, so the sides
 * bow gently into the corners — the "squircle" look. Used by the desktop sort button.
 */
export function superellipsePath(size: number, n: number): string {
	const r = size / 2;
	const e = 2 / n;
	let d = "";
	for (let i = 0; i < POINTS; i++) {
		const t = (i / POINTS) * 2 * Math.PI;
		const c = Math.cos(t);
		const s = Math.sin(t);
		const x = r + r * Math.sign(c) * Math.pow(Math.abs(c), e);
		const y = r + r * Math.sign(s) * Math.pow(Math.abs(s), e);
		d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
	}
	return `${d}Z`;
}
