#!/usr/bin/env node
/**
 * Fails the build when the expo-notifications patch didn't make it into the compiled module.
 *
 * Expo ships expo-notifications as a prebuilt AAR; only `expo.autolinking.android.buildFromSource`
 * (app/package.json) makes Gradle compile the patched sources. Without it the build still succeeds and
 * airing alerts silently fall back to plain text (docs/claude/patches.md). Run after
 * `./gradlew :expo-notifications:compileReleaseKotlin` (or any build of the app) from the repo root or app/.
 */
const fs = require("fs");
const path = require("path");

const MARKERS = ["bigPictureCaption", "bigPictureHeading", "watchloom_alert_expanded"];
const appDir = fs.existsSync(path.join(process.cwd(), "app", "package.json")) ? path.join(process.cwd(), "app") : process.cwd();
const buildDir = path.join(appDir, "node_modules", "expo-notifications", "android", "build");

function fail(message) {
	console.error(`\n✖ expo-notifications patch check failed: ${message}`);
	console.error("  The patched sources were not compiled; airing alerts would ship without pictures / lists.");
	console.error("  Check app/package.json expo.autolinking.android.buildFromSource and app/patches/expo-notifications+*.patch.\n");
	process.exit(1);
}

function findClasses(dir, out = []) {
	if (!fs.existsSync(dir)) return out;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) findClasses(full, out);
		else if (entry.name === "ExpoNotificationBuilder.class") out.push(full);
	}
	return out;
}

if (!fs.existsSync(buildDir)) fail(`no ${path.relative(appDir, buildDir)} — expo-notifications was not built from source (prebuilt AAR used).`);
const classes = findClasses(buildDir);
if (classes.length === 0) fail("ExpoNotificationBuilder.class was not compiled from source.");
for (const file of classes) {
	const bytes = fs.readFileSync(file).toString("latin1");
	const missing = MARKERS.filter((m) => !bytes.includes(m));
	if (missing.length) fail(`${path.relative(appDir, file)} lacks ${missing.join(", ")} — the patch was not applied.`);
}
console.log(`✓ expo-notifications patch compiled (${classes.length} class file${classes.length === 1 ? "" : "s"} checked)`);
