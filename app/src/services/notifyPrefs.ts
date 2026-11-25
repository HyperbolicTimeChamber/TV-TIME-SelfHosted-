import AsyncStorage from "@react-native-async-storage/async-storage";
import { CacheKey } from "../enums";
import { parseNotifyPrefs, type NotifyPrefs } from "../utils/notifyConfig";
import { requestAiringReplan } from "../utils/airingReplanSignal";

/** This device's alert settings (defaults until changed) */
export async function loadNotifyPrefs(): Promise<NotifyPrefs> {
	return parseNotifyPrefs(await AsyncStorage.getItem(CacheKey.NOTIFY_PREFS).catch(() => null));
}

/** Saves the settings and asks the scheduler to re-plan */
export async function saveNotifyPrefs(next: NotifyPrefs): Promise<void> {
	await AsyncStorage.setItem(CacheKey.NOTIFY_PREFS, JSON.stringify(next));
	requestAiringReplan();
}
