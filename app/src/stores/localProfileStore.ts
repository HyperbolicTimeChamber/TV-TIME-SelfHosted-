import { useEffect } from "react";
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	EMPTY_LOCAL_PROFILE,
	localProfileKey,
	parseLocalProfile,
	type LocalProfile,
} from "../utils/localProfile";

interface LocalProfileState {
	/** The account `profile` belongs to */
	uid: string | null;
	profile: LocalProfile;
	load: (uid: string) => Promise<void>;
	/** Applied at once and kept on this device; false when the device couldn't store it */
	save: (uid: string, patch: Partial<LocalProfile>) => Promise<boolean>;
	/** Account deleted: its name and photo go from this device */
	clear: (uid: string) => Promise<void>;
}

// Imported directly (not through ./index): web swaps that file for its Redux shim, this one is shared
export const useLocalProfileStore = create<LocalProfileState>((set, get) => ({
	uid: null,
	profile: EMPTY_LOCAL_PROFILE,

	load: async (uid) => {
		if (get().uid === uid) return;
		set({ uid, profile: EMPTY_LOCAL_PROFILE });
		const raw = await AsyncStorage.getItem(localProfileKey(uid)).catch(() => null);
		// Switched account meanwhile → drop the stale result
		if (get().uid === uid) set({ profile: parseLocalProfile(raw) });
	},

	save: async (uid, patch) => {
		await get().load(uid);
		const previous = get().profile;
		const profile = { ...previous, ...patch };
		set({ profile });
		try {
			await AsyncStorage.setItem(localProfileKey(uid), JSON.stringify(profile));
			return true;
		} catch {
			set({ profile: previous });
			return false;
		}
	},

	clear: async (uid) => {
		if (get().uid === uid) set({ uid: null, profile: EMPTY_LOCAL_PROFILE });
		await AsyncStorage.removeItem(localProfileKey(uid)).catch(() => {});
	},
}));

/** The signed-in account's name / photo kept on this device */
export function useLocalProfile(uid: string | undefined): LocalProfile {
	const owner = useLocalProfileStore((s) => s.uid);
	const profile = useLocalProfileStore((s) => s.profile);
	useEffect(() => {
		if (uid) useLocalProfileStore.getState().load(uid);
	}, [uid]);
	return uid && owner === uid ? profile : EMPTY_LOCAL_PROFILE;
}
