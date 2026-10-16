import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, monthWeeks, shiftMonth, weekDates, weekStart, sameDayIn, inMonth } from "../src/utils/calendarGrid";
import { buildDayMarks } from "../src/utils/calendarGroups";
import { MediaType } from "../src/enums";

test("calendarGrid: Monday-first weeks covering the month", () => {
	const oct = monthWeeks(2026, 10); // Oct 1 2026 is a Thursday
	assert.equal(oct.length, 5);
	assert.equal(oct[0][0], "2026-09-28");
	assert.equal(oct[4][6], "2026-11-01");
	assert.equal(monthWeeks(2026, 8).length, 6); // Aug 2026 starts on a Saturday
	assert.equal(weekStart("2026-10-18"), "2026-10-12"); // Sunday belongs to the week before
	assert.deepEqual(weekDates("2026-10-15").slice(0, 2), ["2026-10-12", "2026-10-13"]);
	assert.equal(addDays("2026-10-31", 1), "2026-11-01");
	assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
	assert.equal(sameDayIn("2026-01-31", 2026, 2), "2026-02-28");
	assert.ok(inMonth("2026-10-05", 2026, 10));
	assert.ok(!inMonth("2026-11-05", 2026, 10));
});

test("buildDayMarks: one marker per show per day, movies typed", () => {
	const ep = (id: number, date: string, episode: number, mediaType = MediaType.TV) => ({
		tmdbShowId: id,
		mediaType,
		season: 1,
		episode,
		airDate: date,
		showTitle: `Show ${id}`,
	});
	const marks = buildDayMarks([ep(1, "2026-10-15", 1), ep(1, "2026-10-15", 2), ep(2, "2026-10-15", 0, MediaType.MOVIE), ep(1, "2026-10-16", 3)]);
	assert.deepEqual(marks.get("2026-10-15")?.map((m) => [m.title, m.mediaType]), [
		["Show 1", MediaType.TV],
		["Show 2", MediaType.MOVIE],
	]);
	assert.equal(marks.get("2026-10-16")?.length, 1);
});

test("planChips: 2-line titles, last slot turns into +n more", async () => {
	const { planChips } = await import("../src/utils/calendarGrid");
	const m = (title: string) => ({ title });
	// lineH 12 + gap 2: room for 50px
	const all = [m("Ted Lasso"), m("The Simpsons Treehouse"), m("Ghosts"), m("Lanterns")];
	const r = planChips(all, 50, 10, 12, 2);
	// Ted Lasso (14) + Simpsons 2 lines (26) = 40, + "+2 more" (14) would be 54 > 50 → only Ted Lasso + more
	assert.deepEqual(r.shown.map((x) => x.title), ["Ted Lasso"]);
	assert.equal(r.more, 3);
	const roomy = planChips(all, 200, 10, 12, 2);
	assert.equal(roomy.shown.length, 4);
	assert.equal(roomy.more, 0);
});
