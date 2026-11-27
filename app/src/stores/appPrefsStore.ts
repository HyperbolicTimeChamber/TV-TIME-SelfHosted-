import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CacheKey } from "../enums";
import { DEFAULT_APP_PREFS, parseAppPrefs, type AppPrefs } from "../utils/appPrefs";

interface AppPrefsState {
	prefs: AppPrefs;
	/** Read from the device — the navigator waits for it, so the first screen is already right */
	loaded: boolean;
	load: () => Promise<void>;
	/** Applied at once and kept on this device */
	update: (patch: Partial<AppPrefs>) => void;
}

// Imported directly (not through ./index): web swaps that file for its Redux shim, this one is shared
export const useAppPrefsStore = create<AppPrefsState>((set, get) => ({
	prefs: DEFAULT_APP_PREFS,
	loaded: false,

	load: async () => {
		if (get().loaded) return;
		const raw = await AsyncStorage.getItem(CacheKey.APP_PREFS).catch(() => null);
		set({ prefs: parseAppPrefs(raw), loaded: true });
	},

	update: (patch) => {
		const prefs = { ...get().prefs, ...patch };
		set({ prefs });
		AsyncStorage.setItem(CacheKey.APP_PREFS, JSON.stringify(prefs)).catch(() => {});
	},
}));
