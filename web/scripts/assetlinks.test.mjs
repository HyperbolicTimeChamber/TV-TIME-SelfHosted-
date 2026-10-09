import { describe, expect, it } from "vitest";
import { buildAssetLinks, normalizeFingerprint } from "./assetlinks.mjs";

const FP = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";

describe("assetlinks", () => {
	it("normalises fingerprints", () => {
		expect(normalizeFingerprint(FP.toLowerCase().replaceAll(":", ""))).toBe(FP);
		expect(() => normalizeFingerprint("abc")).toThrow();
	});

	it("dedupes and targets the app package", () => {
		const [entry] = buildAssetLinks([FP, FP.toLowerCase(), ""]);
		expect(entry.target.package_name).toBe("com.tvtimerevived.app");
		expect(entry.target.sha256_cert_fingerprints).toEqual([FP]);
		expect(entry.relation).toEqual(["delegate_permission/common.handle_all_urls"]);
	});

	it("refuses to publish an empty file", () => {
		expect(() => buildAssetLinks([])).toThrow();
	});
});
