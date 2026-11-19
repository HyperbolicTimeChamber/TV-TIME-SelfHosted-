import AsyncStorage from "@react-native-async-storage/async-storage";
import { CacheKey } from "../enums";
import { parseNotifyPrefs, type NotifyPrefs } from "../utils/airingPlan";
import { requestAiringReplan } from "../utils/airingReplanSignal";
import type { NotificationKind } from "../utils/settingsOptions";

/** This device's alert switches (all on until changed) */
export async function loadNotifyPrefs(): Promise<NotifyPrefs> {
	return parseNotifyPrefs(await AsyncStorage.getItem(CacheKey.NOTIFY_PREFS).catch(() => null));
}

/** Saves one switch and asks the scheduler to re-plan */
export async function setNotifyPref(kind: NotificationKind, value: boolean): Promise<NotifyPrefs> {
	const next = { ...(await loadNotifyPrefs()), [kind]: value };
	await AsyncStorage.setItem(CacheKey.NOTIFY_PREFS, JSON.stringify(next));
	requestAiringReplan();
	return next;
}
