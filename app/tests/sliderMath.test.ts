import { test } from "node:test";
import assert from "node:assert/strict";

import { fractionToValue, parseTyped, touchToFraction, unitLabel, valueToFraction } from "../src/utils/sliderMath";
import { LIMITS, parseNotifyPrefs } from "../src/utils/notifyConfig";

const days = LIMITS.snoozeDays; // 1–14 on the slider, up to 365 typed

test("track position ↔ value round trip, ends clamp", () => {
	assert.equal(valueToFraction(1, days), 0);
	assert.equal(valueToFraction(14, days), 1);
	// Typed past the slider's end: the thumb sits at the end
	assert.equal(valueToFraction(90, days), 1);
	assert.equal(fractionToValue(0, days), 1);
	assert.equal(fractionToValue(1, days), 14);
	assert.equal(fractionToValue(-3, days), 1);
	assert.equal(fractionToValue(7, days), 14);
	for (let v = 1; v <= 14; v++) assert.equal(fractionToValue(valueToFraction(v, days), days), v);
});

test("a count slider can start at 0", () => {
	const cap = LIMITS.maxPerDay;
	assert.equal(fractionToValue(0, cap), 0);
	assert.equal(fractionToValue(0.5, cap), 5);
	assert.equal(valueToFraction(0, cap), 0);
});

test("touch x → position keeps the thumb inside the track", () => {
	assert.equal(touchToFraction(0, 300, 24), 0);
	assert.equal(touchToFraction(12, 300, 24), 0);
	assert.equal(touchToFraction(150, 300, 24), 0.5);
	assert.equal(touchToFraction(999, 300, 24), 1);
	assert.equal(touchToFraction(50, 10, 24), 0);
});

test("typed values: digits only, never negative, inside the limit", () => {
	assert.equal(parseTyped("", days), null);
	assert.equal(parseTyped("abc", days), null);
	assert.equal(parseTyped("20", days), 20);
	assert.equal(parseTyped("365", days), 365);
	assert.equal(parseTyped("9999", days), 365);
	assert.equal(parseTyped("-5", days), 5);
	assert.equal(parseTyped("0", days), 1);
	assert.equal(parseTyped("3.7", days), 37);
	assert.equal(parseTyped("0", LIMITS.maxPerDay), 0);
});

test("unit labels", () => {
	assert.equal(unitLabel(1, "day"), "day");
	assert.equal(unitLabel(2, "day"), "days");
	assert.equal(unitLabel(0, "alert", "alerts", "No limit"), "No limit");
	assert.equal(unitLabel(1, "alert", "alerts", "No limit"), "alert");
});

test("saved values beyond the slider keep their custom value, clamped to the limit", () => {
	const p = parseNotifyPrefs(
		JSON.stringify({
			nudge: { on: true, days: 90 },
			timing: { horizonDays: 45, maxPerDay: 25 },
			weeklyDigest: { on: true, windowDays: 30 },
			grouping: { maxRows: 15 },
			movies: { releaseOn: true, remindOn: true, remindDays: [100, 2] },
		}),
	);
	assert.equal(p.nudge.days, 90);
	assert.equal(p.timing.horizonDays, 45);
	assert.equal(p.timing.maxPerDay, 25);
	assert.equal(p.weeklyDigest.windowDays, 30);
	assert.equal(p.grouping.maxRows, 15);
	assert.deepEqual(p.movies.remindDays, [2, 100]);
	const high = parseNotifyPrefs(JSON.stringify({ nudge: { days: 5000 }, timing: { horizonDays: 500 } }));
	assert.equal(high.nudge.days, 365);
	assert.equal(high.timing.horizonDays, 60);
	const low = parseNotifyPrefs(JSON.stringify({ nudge: { days: -4 }, timing: { maxPerDay: -2 } }));
	assert.equal(low.nudge.days, 1);
	assert.equal(low.timing.maxPerDay, 0);
});
