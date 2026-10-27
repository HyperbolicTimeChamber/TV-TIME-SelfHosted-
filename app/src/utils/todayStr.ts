/** Local-timezone YYYY-MM-DD string. Use instead of toISOString() which gives UTC. */
export function todayStr(): string {
	return localDateStr(new Date());
}

/** Local-timezone YYYY-MM-DD of any moment */
export function localDateStr(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}
