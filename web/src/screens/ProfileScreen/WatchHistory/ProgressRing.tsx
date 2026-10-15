/** Small progress ring for the yellow pill (app ProgressRing) — dark stroke, faint track */
const SIZE = 20;
const STROKE = 3;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

export default function ProgressRing({ percent }: { percent: number }) {
	const offset = CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, percent)) / 100);
	return (
		<svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden>
			<circle cx={SIZE / 2} cy={SIZE / 2} r={R} strokeWidth={STROKE} fill="none" stroke="color-mix(in srgb, var(--color-surface) 22%, transparent)" />
			<circle
				cx={SIZE / 2}
				cy={SIZE / 2}
				r={R}
				strokeWidth={STROKE}
				fill="none"
				stroke="var(--color-surface)"
				strokeDasharray={CIRCUMFERENCE}
				strokeDashoffset={offset}
				strokeLinecap="round"
			/>
		</svg>
	);
}
