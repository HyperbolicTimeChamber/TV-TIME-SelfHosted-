// Web stand-in for @react-native-async-storage/async-storage (localStorage, async API).
// Storage can throw (private mode / quota) — callers already treat failures as cache misses.
const AsyncStorage = {
	async getItem(key: string): Promise<string | null> {
		return window.localStorage.getItem(key);
	},
	async setItem(key: string, value: string): Promise<void> {
		window.localStorage.setItem(key, value);
	},
	async removeItem(key: string): Promise<void> {
		window.localStorage.removeItem(key);
	},
	async multiRemove(keys: string[]): Promise<void> {
		for (const k of keys) window.localStorage.removeItem(k);
	},
	async clear(): Promise<void> {
		window.localStorage.clear();
	},
};

export default AsyncStorage;
