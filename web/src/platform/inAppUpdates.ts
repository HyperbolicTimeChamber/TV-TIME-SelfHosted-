// Play in-app updates don't exist on web (types mirror the native lib loosely)
export const IAUUpdateKind = { FLEXIBLE: 0, IMMEDIATE: 1 };
export default class SpInAppUpdates {
	constructor(_debug?: boolean) {}
	checkNeedsUpdate(_opts?: unknown) {
		return Promise.resolve({ shouldUpdate: false });
	}
	startUpdate(_opts?: unknown) {
		return Promise.resolve();
	}
}
