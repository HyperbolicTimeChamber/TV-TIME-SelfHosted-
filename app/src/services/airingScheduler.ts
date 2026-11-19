import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuth } from "@react-native-firebase/auth";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { AIRING_CHANNEL, ALERT_ID, AlertType, CacheKey, ReplanSource } from "../enums";
import { readSavedTracking } from "../hooks/trackingStore";
import {
	anyAlertOn,
	buildAiringPlan,
	mergeOverrides,
	pruneOverrides,
	toPlanTitle,
	topicDocIds,
	type AiringOverride,
	type PlannedAlert,
	type PlanTitle,
} from "../utils/airingPlan";
import { parseAiringPush } from "../utils/airingPush";
import { showDocId } from "../utils/docId";
import { loadNotifyPrefs } from "./notifyPrefs";
import { syncTitleTopics } from "./titleTopics";
import type { FirebaseMessagingTypes } from "@react-native-firebase/messaging";

/** Notification id of the dev-only "fake airing" (never planned, so a re-plan leaves it alone) */
const DEBUG_ALERT_ID = "debug-airing";
const OUR_PREFIXES: string[] = [ALERT_ID.AIR, ALERT_ID.MORNING, ALERT_ID.DIGEST, ALERT_ID.MOVIE, ALERT_ID.REMINDER, ALERT_ID.NUDGE];

export interface ReplanResult {
	/** Alerts in the plan */
	planned: number;
	/** Newly scheduled (or rescheduled: text changed) */
	scheduled: number;
	cancelled: number;
}

const isOurs = (id: string) => OUR_PREFIXES.some((p) => id.startsWith(p));

/** Foreground notifications show as a banner too */
export function configureAlertDisplay(): void {
	Notifications.setNotificationHandler({
		handleNotification: async () => ({
			shouldShowBanner: true,
			shouldShowList: true,
			shouldPlaySound: false,
			shouldSetBadge: false,
		}),
	});
}

async function ensureChannel(): Promise<void> {
	if (Platform.OS !== "android") return;
	await Notifications.setNotificationChannelAsync(AIRING_CHANNEL, {
		name: "Airing Alerts",
		importance: Notifications.AndroidImportance.HIGH,
	});
}

async function loadOverrides(): Promise<AiringOverride[]> {
	try {
		const list = JSON.parse((await AsyncStorage.getItem(CacheKey.AIRING_OVERRIDES)) ?? "[]");
		return Array.isArray(list) ? (list as AiringOverride[]) : [];
	} catch {
		return [];
	}
}

/** The uid alerts are planned for: the live session, else the one saved by the last foreground plan */
async function planUid(): Promise<string | null> {
	const live = getAuth().currentUser?.uid;
	if (live) {
		AsyncStorage.setItem(CacheKey.AIRING_UID, live).catch(() => {});
		return live;
	}
	return AsyncStorage.getItem(CacheKey.AIRING_UID).catch(() => null);
}

async function planTitles(uid: string) {
	const docs = await readSavedTracking(uid);
	const keys = docs.map((d) => CacheKey.CATALOG_SHOW + showDocId(d.tmdbId, d.mediaType));
	const rows = keys.length ? await AsyncStorage.getMany(keys) : {};
	const titles: PlanTitle[] = [];
	docs.forEach((d, i) => {
		const raw = rows[keys[i]];
		let catalog = null;
		try {
			catalog = raw ? JSON.parse(raw) : null;
		} catch {}
		const title = toPlanTitle(d, catalog);
		if (title) titles.push(title);
	});
	return { docs, titles };
}

function alertData(a: PlannedAlert): Record<string, string | number> {
	return {
		alert: a.type,
		...(a.docId ? { docId: a.docId } : {}),
		...(a.tmdbId ? { tmdbId: a.tmdbId } : {}),
		...(a.mediaType ? { mediaType: a.mediaType } : {}),
	};
}

async function applyPlan(plan: PlannedAlert[]): Promise<{ scheduled: number; cancelled: number }> {
	await ensureChannel();
	const existing = (await Notifications.getAllScheduledNotificationsAsync()).filter((r) => isOurs(r.identifier));
	const byId = new Map(existing.map((r) => [r.identifier, r]));
	const wanted = new Set(plan.map((a) => a.id));
	let cancelled = 0;
	let scheduled = 0;
	for (const r of existing) {
		if (wanted.has(r.identifier)) continue;
		await Notifications.cancelScheduledNotificationAsync(r.identifier);
		cancelled++;
	}
	for (const a of plan) {
		const current = byId.get(a.id);
		if (current && current.content.title === a.title && current.content.body === a.body) continue;
		await Notifications.scheduleNotificationAsync({
			identifier: a.id,
			content: { title: a.title, body: a.body, data: alertData(a) },
			trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: a.fireAt, channelId: AIRING_CHANNEL },
		});
		scheduled++;
	}
	return { scheduled, cancelled };
}

async function doReplan(source: ReplanSource): Promise<ReplanResult> {
	const none = { planned: 0, scheduled: 0, cancelled: 0 };
	if (Platform.OS !== "android") return none;
	const uid = await planUid();
	if (!uid) return none;
	const prefs = await loadNotifyPrefs();
	// The daily task is only registered while some alert is on
	if (source !== ReplanSource.BACKGROUND) {
		const { setAiringTaskEnabled } = await import("./airingTask");
		await setAiringTaskEnabled(anyAlertOn(prefs)).catch(() => {});
	}
	const permission = await Notifications.getPermissionsAsync();
	if (!permission.granted) return none;

	const { docs, titles } = await planTitles(uid);
	const now = Date.now();
	const overrides = pruneOverrides(await loadOverrides(), now);
	AsyncStorage.setItem(CacheKey.AIRING_OVERRIDES, JSON.stringify(overrides)).catch(() => {});
	// In the app the last open is now; the background task reads the last saved open
	const lastOpenMs =
		source === ReplanSource.BACKGROUND
			? Number(await AsyncStorage.getItem(CacheKey.LAST_APP_OPEN).catch(() => 0)) || 0
			: now;
	const plan = buildAiringPlan({ now, titles, prefs, overrides, lastOpenMs });
	const applied = await applyPlan(plan);
	// Day-ahead corrections: follow the tracked titles' topics (none while every alert is off)
	if (source !== ReplanSource.BACKGROUND) {
		await syncTitleTopics(anyAlertOn(prefs) ? topicDocIds(docs) : []).catch(() => {});
	}
	return { planned: plan.length, ...applied };
}

let chain: Promise<unknown> = Promise.resolve();

/** Re-plans and applies the alerts. Runs one at a time (a push, the daily task and a launch can overlap) */
export function replanAiring(source: ReplanSource): Promise<ReplanResult> {
	const run = chain.then(
		() => doReplan(source),
		() => doReplan(source),
	);
	chain = run.catch(() => {});
	return run;
}

/** Signed out: nothing stays scheduled or followed */
export async function clearAiring(): Promise<void> {
	if (Platform.OS !== "android") return;
	const existing = await Notifications.getAllScheduledNotificationsAsync();
	for (const r of existing) if (isOurs(r.identifier)) await Notifications.cancelScheduledNotificationAsync(r.identifier);
	await syncTitleTopics([]).catch(() => {});
	await AsyncStorage.removeMany([CacheKey.AIRING_UID, CacheKey.AIRING_OVERRIDES]).catch(() => {});
}

/** An airing push (app open: onMessage; closed: the background handler in index.ts). True when it was one */
export async function handleAiringMessage(message: FirebaseMessagingTypes.RemoteMessage): Promise<boolean> {
	const push = parseAiringPush(message.data);
	if (!push) return false;
	if (push.overrides.length) {
		const merged = mergeOverrides(await loadOverrides(), push.overrides);
		await AsyncStorage.setItem(CacheKey.AIRING_OVERRIDES, JSON.stringify(merged));
	}
	await replanAiring(ReplanSource.PUSH).catch(() => {});
	return true;
}

/** Dev only (Settings → Updates (test)): an alert two minutes from now, to watch it arrive with the app swiped away */
export async function scheduleFakeAiring(): Promise<void> {
	await ensureChannel();
	await Notifications.scheduleNotificationAsync({
		identifier: DEBUG_ALERT_ID,
		content: { title: "Test Show", body: "S1 E1 · Fake airing", data: { alert: AlertType.EPISODE } },
		trigger: {
			type: Notifications.SchedulableTriggerInputTypes.DATE,
			date: Date.now() + 2 * 60 * 1000,
			channelId: AIRING_CHANNEL,
		},
	});
}
