import { test } from "node:test";
import assert from "node:assert/strict";
import {
	ACCENT_OPTIONS,
	AccentId,
	DEFAULT_THEME_PREFS,
	ThemeMode,
	buildPalette,
	mixHex,
	parseThemePrefs,
	resolveScheme,
} from "../src/theme/palette";

test("resolveScheme follows the device only on System", () => {
	assert.equal(resolveScheme(ThemeMode.SYSTEM, "light"), ThemeMode.LIGHT);
	assert.equal(resolveScheme(ThemeMode.SYSTEM, "dark"), ThemeMode.DARK);
	assert.equal(resolveScheme(ThemeMode.SYSTEM, null), ThemeMode.DARK);
	assert.equal(resolveScheme(ThemeMode.DARK, "light"), ThemeMode.DARK);
	assert.equal(resolveScheme(ThemeMode.LIGHT, "dark"), ThemeMode.LIGHT);
});

test("buildPalette: default prefs keep today's look", () => {
	const p = buildPalette(DEFAULT_THEME_PREFS);
	assert.equal(p.background, "#000000");
	assert.equal(p.primary, "#E50914");
	assert.equal(p.accent, "#4A90D9");
	assert.equal(p.primaryDark, "#390205");
});

test("buildPalette: light theme flips surfaces and text, keeps text on photos white", () => {
	const p = buildPalette({ mode: ThemeMode.LIGHT, accent: AccentId.GREEN });
	assert.notEqual(p.background, "#000000");
	assert.equal(p.text, "#111114");
	assert.equal(p.onImage, "#FFFFFF");
	assert.equal(p.primary, p.accent);
});

test("every accent option is a full hex pair", () => {
	for (const o of ACCENT_OPTIONS) {
		assert.match(o.primary, /^#[0-9A-F]{6}$/);
		assert.match(o.accent, /^#[0-9A-F]{6}$/);
	}
});

test("mixHex blends and clamps ends", () => {
	assert.equal(mixHex("#000000", "#FFFFFF", 0), "#000000");
	assert.equal(mixHex("#000000", "#FFFFFF", 1), "#FFFFFF");
	assert.equal(mixHex("#000000", "#FFFFFF", 0.5), "#808080");
});

test("parseThemePrefs falls back on anything invalid", () => {
	assert.deepEqual(parseThemePrefs(null), DEFAULT_THEME_PREFS);
	assert.deepEqual(parseThemePrefs("not json"), DEFAULT_THEME_PREFS);
	assert.deepEqual(parseThemePrefs('{"mode":"neon","accent":"red"}'), {
		mode: ThemeMode.DARK,
		accent: AccentId.RED,
	});
	assert.deepEqual(parseThemePrefs('{"mode":"light","accent":"purple"}'), {
		mode: ThemeMode.LIGHT,
		accent: AccentId.PURPLE,
	});
});

test("buildPalette: classic accent is darkened on the light theme only (white text contrast)", () => {
	const light = buildPalette({ mode: ThemeMode.LIGHT, accent: AccentId.CLASSIC });
	const dark = buildPalette({ mode: ThemeMode.DARK, accent: AccentId.CLASSIC });
	assert.equal(dark.accent, "#4A90D9");
	assert.notEqual(light.accent, "#4A90D9");
});
