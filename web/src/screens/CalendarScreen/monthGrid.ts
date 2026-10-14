const pad = (n: number) => String(n).padStart(2, "0");

/** 6-row month grid (Sunday first, like react-native-calendars) */
export function monthGrid(year: number, month: number): Array<{ date: string; inMonth: boolean; day: number }> {
	const first = new Date(year, month - 1, 1);
	const start = new Date(first);
	start.setDate(1 - first.getDay());
	return Array.from({ length: 42 }, (_, i) => {
		const d = new Date(start);
		d.setDate(start.getDate() + i);
		return {
			date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
			inMonth: d.getMonth() === month - 1,
			day: d.getDate(),
		};
	});
}
