import { useAuthStore } from "../stores";
import { UPDATE_URL } from "../enums";

const { expo } = require("../../app.json");
/** Build number baked into this binary (CI bumps app.json before building) */
const appBuild: number = Number(expo.android?.versionCode ?? expo.ios?.buildNumber ?? 0);

/**
 * True when this build is older than its channel's minimum (config/app.minBuildDev /
 * minBuildProd, set by CI on [force-update]). Builds go out through Firebase App
 * Distribution, so the app blocks itself and links to the channel's tester page.
 */
export function useForceUpdate(): boolean {
	const minBuild = useAuthStore((s) => s.minBuild);
	// No link baked in (secret missing) → never trap users on a screen without a way out
	return !!UPDATE_URL && minBuild != null && appBuild > 0 && appBuild < minBuild;
}
