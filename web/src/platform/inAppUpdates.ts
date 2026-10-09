// Play in-app updates don't exist on web
export const IAUUpdateKind = { FLEXIBLE: 0, IMMEDIATE: 1 };
export default class SpInAppUpdates {
	checkNeedsUpdate() {
		return Promise.resolve({ shouldUpdate: false });
	}
	startUpdate() {
		return Promise.resolve();
	}
}
