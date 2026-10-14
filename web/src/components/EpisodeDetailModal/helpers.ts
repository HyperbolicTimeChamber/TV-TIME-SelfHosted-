const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(dateStr: string): string {
	const [y, m, d] = dateStr.split("-");
	return `${Number.parseInt(d, 10)} ${MONTHS[Number.parseInt(m, 10) - 1]} ${y}`;
}

/** Carousel watched-map key (same as the app's EpisodeDetailModal) */
export function epKey(s: number, e: number): string {
	return `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`;
}
