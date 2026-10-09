/** Replace Google profile photo size param with screen-aware resolution */
export function scaledPhotoURL(url: string, layoutSize: number, pixelRatio = 1): string {
	const px = Math.ceil(layoutSize * pixelRatio);
	return url.replace(/=s\d+-c/, `=s${px}-c`);
}

/** 1234 → 1.2K, 2_500_000 → 2.5M */
export function formatCount(n: number) {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
	return `${n}`;
}

/** Minutes → "2y 14d" / "3d 4h" / "5h 12m" / "40m" */
export function formatTime(minutes: number) {
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const years = Math.floor(days / 365);
	if (years > 0) return `${years}y ${days % 365}d`;
	if (days > 0) return `${days}d ${hours % 24}h`;
	if (hours > 0) return `${hours}h ${minutes % 60}m`;
	return `${minutes}m`;
}
