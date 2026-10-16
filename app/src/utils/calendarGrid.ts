import { localDateStr } from "./todayStr";

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
export function shiftMonth(year: number, month: number, n: number): { year: number; month: number } {
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

/** Same calendar month? */
export function inMonth(day: string, year: number, month: number): boolean {
	return day.startsWith(`${year}-${pad(month)}`);
}

/** Day to land on in another month: same day number, clamped to that month's length */
export function sameDayIn(day: string, year: number, month: number): string {
	const lastDay = new Date(year, month, 0).getDate();
	return `${year}-${pad(month)}-${pad(Math.min(parseDay(day).getDate(), lastDay))}`;
}
