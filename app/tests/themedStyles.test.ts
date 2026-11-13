import { test } from "node:test";
import assert from "node:assert/strict";
import { themedStyles } from "../src/theme/themedStyles";
import { bumpThemeVersion, getThemeVersion } from "../src/theme/themeStore";

test("themedStyles builds lazily and once per theme version", () => {
	let builds = 0;
	let color = "#000000";
	const styles = themedStyles(() => {
		builds += 1;
		return { box: { backgroundColor: color }, text: { color } };
	});
	assert.equal(builds, 0, "nothing built until a style is read");
	assert.equal(styles.box.backgroundColor, "#000000");
	assert.equal(styles.text.color, "#000000");
	assert.equal(builds, 1, "several reads share one build");
	assert.equal(styles.box, styles.box, "the same object between reads");
});

test("themedStyles rebuilds after the theme version bumps", () => {
	let color = "#111111";
	const styles = themedStyles(() => ({ box: { backgroundColor: color } }));
	assert.equal(styles.box.backgroundColor, "#111111");
	color = "#222222";
	assert.equal(styles.box.backgroundColor, "#111111", "unchanged until the theme changes");
	const before = getThemeVersion();
	bumpThemeVersion();
	assert.equal(getThemeVersion(), before + 1);
	assert.equal(styles.box.backgroundColor, "#222222");
});

test("themedStyles supports spread, has and key listing", () => {
	const styles = themedStyles(() => ({ a: { x: 1 }, b: { x: 2 } }));
	assert.deepEqual(Object.keys(styles), ["a", "b"]);
	assert.ok("a" in styles);
	assert.deepEqual({ ...styles.a, y: 3 }, { x: 1, y: 3 });
});
