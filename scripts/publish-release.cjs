#!/usr/bin/env node
// CI (after the GitHub release is up): tells the apps about a new build.
//  1. config/release.{channel} = { version, build, apkUrl, size, notes, publishedAt, minBuild }
//     — the in-app update drawer reads it (public doc, one read per launch)
//  2. [force-update]: minBuild = this build (also the legacy config/app.minBuild{Dev,Prod} that
//     builds before in-app updates read) — callables refuse older builds, the app blocks itself
//  3. an FCM data message to the channel's topic → "V x.y.z is available" notification
// Env: CHANNEL (dev|prod), VERSION, BUILD, APK_URL, SIZE, NOTES, FORCE ("true"),
//      GOOGLE_APPLICATION_CREDENTIALS (service account). Mirrors app enums RELEASE_CONFIG_DOC,
//      UPDATE_TOPIC, APP_UPDATE_MESSAGE and MIN_BUILD_FIELD (plain JS can't import them).
// Test flow (staging only, from a laptop): scripts/release-test.sh
const { createRequire } = require("module");
const path = require("path");

const fnRequire = createRequire(path.join(__dirname, "../functions/package.json"));
const { initializeApp } = fnRequire("firebase-admin/app");
const { getFirestore, FieldValue } = fnRequire("firebase-admin/firestore");
const { getMessaging } = fnRequire("firebase-admin/messaging");

const CHANNELS = { dev: "minBuildDev", prod: "minBuildProd" };
const TOPIC = { dev: "app-updates-dev", prod: "app-updates-prod" };
const APP_UPDATE_MESSAGE = "app_update";

async function main() {
	const { CHANNEL, VERSION, APK_URL, NOTES = "", FORCE } = process.env;
	const build = Number(process.env.BUILD);
	const size = Number(process.env.SIZE) || 0;
	if (!CHANNELS[CHANNEL] || !VERSION || !build || !APK_URL) {
		throw new Error("CHANNEL (dev|prod), VERSION, BUILD and APK_URL are required");
	}
	const force = FORCE === "true";

	initializeApp();
	const db = getFirestore();
	const entry = {
		version: VERSION,
		build,
		apkUrl: APK_URL,
		size,
		notes: NOTES.trim().slice(0, 1000),
		publishedAt: FieldValue.serverTimestamp(),
	};
	if (force) entry.minBuild = build;
	await db.doc("config/release").set({ [CHANNEL]: entry }, { merge: true });
	console.log(`config/release.${CHANNEL} = V ${VERSION} (${build})${force ? `, minBuild ${build}` : ""}`);

	if (force) {
		await db.doc("config/app").set({ [CHANNELS[CHANNEL]]: build }, { merge: true });
		console.log(`config/app.${CHANNELS[CHANNEL]} = ${build}`);
	}

	const id = await getMessaging().send({
		topic: TOPIC[CHANNEL],
		data: { type: APP_UPDATE_MESSAGE, channel: CHANNEL, build: String(build), version: VERSION },
		// Data-only + high priority: wakes the app's background handler, which shows the notification
		android: { priority: "high" },
	});
	console.log(`FCM ${TOPIC[CHANNEL]}: ${id}`);
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
