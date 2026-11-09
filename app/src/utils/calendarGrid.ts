import { localDateStr } from "./todayStr";
import { MediaType } from "../enums";

/** Week runs Monday → Sunday (Samsung Calendar layout) */
export const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
/** Column of Sunday — its day numbers are drawn in red */
export const SUNDAY_COLUMN = 6;

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DD" → local midnight */
export function parseDay(day: string): Date {
	const [y, m, d] = day.split("-").map(Number);
	return new Date(y, m - 1, d);
}

export function addDays(day: string, n: number): string {
	const d = parseDay(day);
	d.setDate(d.getDate() + n);
	return localDateStr(d);
}

/** Year/month n months away (month is 1-based) */
export function shiftMonth(
	year: number,
	month: number,
	n: number,
): { year: number; month: number } {
	const d = new Date(year, month - 1 + n, 1);
	return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** Monday of the day's week */
export function weekStart(day: string): string {
	const dow = (parseDay(day).getDay() + 6) % 7;
	return addDays(day, -dow);
}

/** The 7 days (Mon → Sun) of the day's week */
export function weekDates(day: string): string[] {
	const start = weekStart(day);
	return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Whole weeks covering a month (4–6 rows), each Mon → Sun */
export function monthWeeks(year: number, month: number): string[][] {
	const first = `${year}-${pad(month)}-01`;
	const lastDay = new Date(year, month, 0).getDate();
	const last = `${year}-${pad(month)}-${pad(lastDay)}`;
	const weeks: string[][] = [];
	for (let start = weekStart(first); start <= last; start = addDays(start, 7)) {
		weeks.push(weekDates(start));
	}
	return weeks;
}

/** Days since 1970-01-01 (local) — a day's position for paging */
export function dayNumber(day: string): number {
	return Math.round(parseDay(day).getTime() / 86_400_000);
}

/** Same calendar month? */
export function inMonth(day: string, year: number, month: number): boolean {
	return day.startsWith(`${year}-${pad(month)}`);
}

/** Day to land on in another month: same day number, clamped to that month's length */
export function sameDayIn(day: string, year: number, month: number): string {
	const lastDay = new Date(year, month, 0).getDate();
	return `${year}-${pad(month)}-${pad(Math.min(parseDay(day).getDate(), lastDay))}`;
}

/**
 * The first `max` of a day's marks for its bars, except that a day with both episodes and
 * movies always shows at least one of each: when the first few are all one kind, the last bar
 * goes to the first mark of the other. Otherwise a movie behind three episodes never showed
 * purple in the overview.
 */
export function pickBars<T extends { mediaType: MediaType }>(marks: T[], max: number): T[] {
	const shown = marks.slice(0, max);
	if (shown.length < max) return shown;
	const isMovie = (m: T) => m.mediaType === MediaType.MOVIE;
	const missing = shown.some(isMovie)
		? marks.find((m) => !isMovie(m) && !shown.includes(m))
		: marks.find(isMovie);
	if (missing && shown.every((m) => isMovie(m) === isMovie(shown[0]))) shown[max - 1] = missing;
	return shown;
}

/**
 * Which event chips fit a full-view day cell. Titles wrap to at most 2 lines (estimated from
 * charsPerLine); what doesn't fit is summed up in "+n more" lines at the bottom — one per kind
 * (`kindOf`, e.g. episodes vs movies) so a hidden movie is still told apart from hidden episodes.
 * `moreByKind` lists those lines in first-hidden order; `more` is their total.
 */
export function planChips<T extends { title: string }, K = string>(
	marks: T[],
	space: number,
	charsPerLine: number,
	lineH: number,
	gap: number,
	kindOf?: (mark: T) => K,
): { shown: T[]; more: number; moreByKind: { kind: K | undefined; count: number }[] } {
	const height = (t: string) => (t.length > charsPerLine ? 2 : 1) * lineH + gap;
	const kinds = (rest: T[]) => new Set(rest.map((m) => kindOf?.(m))).size;
	const shown: T[] = [];
	let used = 0;
	for (let i = 0; i < marks.length; i++) {
		const need = height(marks[i].title);
		// Keep a one-line slot per kind of "+n more" while anything would be left over
		const reserve = kinds(marks.slice(i + 1)) * (lineH + gap);
		if (used + need + reserve > space) break;
		shown.push(marks[i]);
		used += need;
	}
	const moreByKind: { kind: K | undefined; count: number }[] = [];
	for (const m of marks.slice(shown.length)) {
		const kind = kindOf?.(m);
		const line = moreByKind.find((l) => l.kind === kind);
		if (line) line.count++;
		else moreByKind.push({ kind, count: 1 });
	}
	return { shown, more: marks.length - shown.length, moreByKind };
}
