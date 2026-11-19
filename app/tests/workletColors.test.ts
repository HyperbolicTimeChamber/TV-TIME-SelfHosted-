import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Reanimated freezes (in dev) every object a worklet captures. `colors` is mutated in place on a theme
 * switch (applyThemePrefs), so a worklet that reads it breaks the switch ("Tried to modify key `accent`
 * of an object which has been already passed to a worklet"). Worklets must read plain color strings.
 */
const WORKLET_CALLS =
	/(useAnimatedStyle|useDerivedValue|useAnimatedProps|useAnimatedReaction|useAnimatedScrollHandler|runOnUI|scheduleOnUI)\s*\(/g;

function sourceFiles(dir: string, out: string[] = []): string[] {
	for (const name of fs.readdirSync(dir)) {
		const p = path.join(dir, name);
		if (fs.statSync(p).isDirectory()) sourceFiles(p, out);
		else if (/\.tsx?$/.test(p)) out.push(p);
	}
	return out;
}

/** Source ranges of the worklet callbacks: the call's parentheses, and "worklet" function bodies */
function workletRanges(src: string): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];
	for (const m of src.matchAll(WORKLET_CALLS)) {
		let i = (m.index ?? 0) + m[0].length;
		let depth = 1;
		while (i < src.length && depth) {
			if (src[i] === "(") depth++;
			else if (src[i] === ")") depth--;
			i++;
		}
		ranges.push([m.index ?? 0, i]);
	}
	for (const m of src.matchAll(/["']worklet["']/g)) {
		let i = m.index ?? 0;
		while (i > 0 && src[i] !== "{") i--;
		const start = i;
		let depth = 1;
		i++;
		while (i < src.length && depth) {
			if (src[i] === "{") depth++;
			else if (src[i] === "}") depth--;
			i++;
		}
		ranges.push([start, i]);
	}
	return ranges;
}

test("no worklet captures the mutable colors palette", () => {
	const offenders: string[] = [];
	for (const file of sourceFiles(path.join(process.cwd(), "src"))) {
		const src = fs.readFileSync(file, "utf8");
		for (const [a, b] of workletRanges(src)) {
			if (/\bcolors\b/.test(src.slice(a, b))) {
				offenders.push(`${path.relative(process.cwd(), file)}:${src.slice(0, a).split("\n").length}`);
			}
		}
	}
	assert.deepEqual(offenders, []);
});
