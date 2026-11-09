#!/usr/bin/env node
// In-app update test flow for STAGING (dev channel only — prod is never touched).
// Usage: node scripts/release-test.cjs <command> [--emulator]
//   status        print config/release.dev
//   offer         point dev at the newest -staging GitHub release (the drawer offers it to
//                 every staging build older than it)
//   force         make the newest staging build the minimum (older staging builds are blocked:
//                 drawer can't be dismissed, callables refuse them)
//   unforce       remove the dev minimum
//   notify        send the new-version push to the dev topic (notification with Install)
// Needs GOOGLE_APPLICATION_CREDENTIALS (service account), or --emulator for the local Emulator
// Suite (npm run emulators). Checklist: docs/testing/in-app-update.md
const { execSync } = require("child_process");
const { createRequire } = require("module");
const path = require("path");

const args = process.argv.slice(2);
const emulator = args.includes("--emulator");
const command = args.find((a) => !a.startsWith("--")) ?? "status";
if (emulator) {
	process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
	process.env.GCLOUD_PROJECT ??= JSON.parse(
		require("fs").readFileSync(path.join(__dirname, "../.firebaserc"), "utf8"),
	).projects.default;
}

const fnRequire = createRequire(path.join(__dirname, "../functions/package.json"));
const { initializeApp } = fnRequire("firebase-admin/app");
const { getFirestore, FieldValue } = fnRequire("firebase-admin/firestore");
const { getMessaging } = fnRequire("firebase-admin/messaging");

const CHANNEL = "dev";
const TOPIC = "app-updates-dev";

/** Newest -staging release on GitHub (gh CLI): its version, build, APK url + size */
function latestStagingRelease() {
	const list = JSON.parse(
		execSync("gh release list --limit 50 --json tagName,isPrerelease,createdAt", { encoding: "utf8" }),
	);
	const tag = list.find((r) => /^v\d+\.\d+\.\d+\+\d+-staging$/.test(r.tagName))?.tagName;
	if (!tag) throw new Error("No -staging release on GitHub yet — push to staging first");
	const release = JSON.parse(execSync(`gh release view ${tag} --json assets,body`, { encoding: "utf8" }));
	const apk = release.assets.find((a) => a.name.endsWith(".apk"));
	const [, version, build] = tag.match(/^v(\d+\.\d+\.\d+)\+(\d+)-staging$/);
	return { version, build: Number(build), apkUrl: apk.url, size: apk.size, notes: release.body ?? "" };
}

async function main() {
	initializeApp();
	const ref = getFirestore().doc("config/release");
	switch (command) {
		case "status":
			break;
		case "offer": {
			const r = latestStagingRelease();
			await ref.set({ [CHANNEL]: { ...r, publishedAt: FieldValue.serverTimestamp() } }, { merge: true });
			break;
		}
		case "force": {
			const r = latestStagingRelease();
			await ref.set({ [CHANNEL]: { ...r, minBuild: r.build } }, { merge: true });
			break;
		}
		case "unforce":
			await ref.set({ [CHANNEL]: { minBuild: FieldValue.delete() } }, { merge: true });
			break;
		case "notify": {
			const snap = await ref.get();
			const entry = snap.get(CHANNEL);
			if (!entry) throw new Error("No dev release yet — run `offer` first");
			if (emulator) throw new Error("FCM can't be sent to the emulator — use Settings → Updates (test)");
			const id = await getMessaging().send({
				topic: TOPIC,
				data: { type: "app_update", channel: CHANNEL, build: String(entry.build), version: entry.version },
				android: { priority: "high" },
			});
			console.log(`FCM ${TOPIC}: ${id}`);
			break;
		}
		default:
			throw new Error(`Unknown command "${command}" (status | offer | force | unforce | notify)`);
	}
	console.log("config/release.dev =", JSON.stringify((await ref.get()).get(CHANNEL) ?? null, null, 2));
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err.message ?? err);
		process.exit(1);
	});
