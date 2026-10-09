// Builds /.well-known/assetlinks.json so Android verifies App Links for
// https://<web>/show/* → com.tvtimerevived.app. Fingerprints come from CI
// (release keystore + optional Play App Signing key), never hard-coded.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const ANDROID_PACKAGE = "com.tvtimerevived.app";

/** Normalise "aa:bb..." / "AABB..." fingerprints to upper-case colon form */
export function normalizeFingerprint(fp) {
	const hex = fp.replace(/[^0-9a-f]/gi, "").toUpperCase();
	if (hex.length !== 64) throw new Error(`Invalid SHA-256 fingerprint: ${fp}`);
	return hex.match(/.{2}/g).join(":");
}

export function buildAssetLinks(fingerprints) {
	const unique = [...new Set(fingerprints.filter(Boolean).map(normalizeFingerprint))];
	if (unique.length === 0) throw new Error("No signing certificate fingerprints provided");
	return [
		{
			relation: ["delegate_permission/common.handle_all_urls"],
			target: {
				namespace: "android_app",
				package_name: ANDROID_PACKAGE,
				sha256_cert_fingerprints: unique,
			},
		},
	];
}

// CLI: node scripts/assetlinks.mjs <outFile> <fp1> [fp2...]
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
	const [outFile, ...fps] = process.argv.slice(2);
	const out = resolve(outFile);
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, JSON.stringify(buildAssetLinks(fps), null, 2) + "\n");
	console.log(`Wrote ${out}`);
}
