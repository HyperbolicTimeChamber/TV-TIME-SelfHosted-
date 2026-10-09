export interface PosterLayout {
	left: number;
	top: number;
	rotate: number;
	zIndex: number;
}

/** Deterministic scattered-poster layout (percent positions) for profile collage cards */
export function generateCollageLayout(count: number, seed: number): PosterLayout[] {
	let s = seed;
	const rand = () => {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		return (s % 1000) / 1000;
	};

	const cols = Math.ceil(Math.sqrt(count * 1.5));
	const rows = Math.ceil(count / cols);
	const cellW = 100 / cols;
	const cellH = 100 / rows;

	const layouts: PosterLayout[] = [];
	for (let i = 0; i < count; i++) {
		const col = i % cols;
		const row = Math.floor(i / cols);
		layouts.push({
			left: col * cellW * 1.1 + rand() * cellW * 0.3 - 10,
			top: row * cellH + rand() * cellH * 0.5 - 15,
			rotate: rand() * 24 - 12,
			zIndex: Math.floor(rand() * count),
		});
	}
	return layouts;
}
