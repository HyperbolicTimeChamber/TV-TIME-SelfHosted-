import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuth } from "@react-native-firebase/auth";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { AIRING_CHANNEL, ALERT_ID, AlertType, CacheKey, MediaType, ReplanSource } from "../enums";
import { readSavedTracking } from "../hooks/trackingStore";
import {
	anyAlertOn,
	buildAiringPlan,
	episodeCode,
	AIRING_TODAY,
	moreEpisodes,
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
import { TMDB_IMAGE_BASE } from "../theme";
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

/** Fire time (ms) of a scheduled date trigger; null when this OS / version doesn't expose it */
function firesAt(trigger: unknown): number | null {
	const t = trigger as { value?: unknown; date?: unknown } | null;
	const v = t?.value ?? t?.date;
	if (typeof v === "number") return v;
	return v instanceof Date ? v.getTime() : null;
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

/** Notification data; `lines` / `bigPicture` / `bigPictureLogo` / `bigPictureCaption` / `bigPictureHeading` drive the patched Android styles (expo-notifications patch) */
function alertData(a: PlannedAlert): Record<string, string | number> {
	return {
		alert: a.type,
		...(a.docId ? { docId: a.docId } : {}),
		...(a.tmdbId ? { tmdbId: a.tmdbId } : {}),
		...(a.mediaType ? { mediaType: a.mediaType } : {}),
		...(a.lines?.length ? { lines: JSON.stringify(a.lines) } : {}),
		...(a.image
			? { bigPicture: `${TMDB_IMAGE_BASE}/${a.image.still ? "original" : "w1280"}${a.image.picturePath}` }
			: {}),
		...(a.image?.logoPath ? { bigPictureLogo: `${TMDB_IMAGE_BASE}/w500${a.image.logoPath}` } : {}),
		...(a.image?.caption?.length ? { bigPictureCaption: a.image.caption.join("\n") } : {}),
		...(a.image?.heading ? { bigPictureHeading: a.image.heading } : {}),
	};
}

/** Same data → no reschedule (the episode list or picture can change while the title and body stay) */
function sameData(current: Record<string, unknown> | undefined, wanted: Record<string, string | number>): boolean {
	const keys = new Set([...Object.keys(current ?? {}), ...Object.keys(wanted)]);
	for (const k of keys) if (String(current?.[k] ?? "") !== String(wanted[k] ?? "")) return false;
	return true;
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
		const data = alertData(a);
		if (
			current &&
			current.content.title === a.title &&
			current.content.body === a.body &&
			sameData(current.content.data as Record<string, unknown> | undefined, data)
		) {
			// The id carries the fire time for every alert but the reopen nudge, whose time moves with each app open
			const at = firesAt(current.trigger);
			const moved = at === null ? a.id === ALERT_ID.NUDGE : Math.abs(at - a.fireAt) > 1000;
			if (!moved) continue;
		}
		await Notifications.scheduleNotificationAsync({
			identifier: a.id,
			content: { title: a.title, body: a.body, data },
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

/**
 * Dev only (Settings → Updates (test)): one alert of every kind right now, built from the saved titles, to see how
 * each one looks (expanded lists, the movie picture). Ids are outside OUR_PREFIXES, so a re-plan leaves them alone
 */
export async function sendSampleAlerts(): Promise<number> {
	if (Platform.OS !== "android") return 0;
	await ensureChannel();
	const uid = await planUid();
	const { titles } = uid ? await planTitles(uid) : { titles: [] as PlanTitle[] };
	const shows = titles.filter((t) => t.mediaType === MediaType.TV);
	const movie =
		titles.find((t) => t.mediaType === MediaType.MOVIE && t.backdropPath && t.logoPath) ??
		titles.find((t) => t.mediaType === MediaType.MOVIE && t.backdropPath);
	const name = (i: number, fallback: string) => shows[i]?.title ?? fallback;
	const epName = (t: PlanTitle | undefined, s: number, e: number) => {
		const n = t?.seasons.find((x) => x.seasonNumber === s)?.episodes.find((x) => x.episodeNumber === e)?.title;
		return n && !/^Episode \d+$/i.test(n) ? ` · ${n}` : "";
	};
	const row = (t: PlanTitle | undefined, s: number, e: number) => `S${s} E${e}${epName(t, s, e)}`;
	const still = (t: PlanTitle | undefined, s: number, e: number) =>
		t?.seasons.find((x) => x.seasonNumber === s)?.episodes.find((x) => x.episodeNumber === e)?.stillPath ?? undefined;
	/** The picture the planner would give: still (episode) or backdrop (premiere), logo, caption */
	const art = (t: PlanTitle | undefined, s: number, e: number, premiere: boolean, count = 1): Partial<PlannedAlert> => {
		const st = still(t, s, e);
		const picturePath = premiere ? (t?.backdropPath ?? st) : (st ?? t?.backdropPath);
		if (!picturePath) return {};
		const n = epName(t, s, e).replace(/^ · /, "");
		const code = episodeCode(s, e);
		const caption = [premiere ? `Season ${s} Premiere` : n ? `${code} · ${n}` : code, ...(count > 1 ? [moreEpisodes(count - 1)] : [])];
		return {
			image: {
				picturePath,
				...(picturePath === st ? { still: true } : {}),
				...(t?.logoPath ? { logoPath: t.logoPath } : {}),
				caption,
				heading: AIRING_TODAY,
			},
		};
	};
	// Episodes with a still make the best samples
	const epWithStill = (t: PlanTitle | undefined) => {
		for (const season of [...(t?.seasons ?? [])].reverse())
			for (const e of season.episodes) if (e.stillPath && season.seasonNumber > 0) return { s: season.seasonNumber, e: e.episodeNumber };
		return { s: 1, e: 4 };
	};
	const a0 = epWithStill(shows[0]);
	const b0 = epWithStill(shows[4]);
	const batch = Array.from({ length: 8 }, (_, i) => (i === 0 ? `Season 1 premiere${epName(shows[2], 1, 1)}` : row(shows[2], 1, i + 1)));
	const morning = [
		`${name(0, "Show A")} · ${row(shows[0], 1, 4)}`,
		`${name(1, "Show B")} · ${row(shows[1], 2, 6)}`,
		`${name(1, "Show B")} · ${row(shows[1], 2, 7)}`,
		`${name(3, "Show D")} · Season 2 premiere${epName(shows[3], 2, 1)}`,
	];
	const samples: PlannedAlert[] = [
		{ id: "", fireAt: 0, type: AlertType.EPISODE, title: name(0, "Show A"), body: row(shows[0], a0.s, a0.e), ...art(shows[0], a0.s, a0.e, false) },
		{
			id: "",
			fireAt: 0,
			type: AlertType.EPISODE,
			title: name(4, "Show E"),
			body: "3 new episodes",
			lines: [row(shows[4], b0.s, b0.e), row(shows[4], b0.s, b0.e + 1), row(shows[4], b0.s, b0.e + 2)],
			...art(shows[4], b0.s, b0.e, false, 3),
		},
		{
			id: "",
			fireAt: 0,
			type: AlertType.PREMIERE,
			title: name(1, "Show B"),
			body: `Season 2 premiere${epName(shows[1], 2, 1)}`,
			...art(shows[1], 2, 1, true),
		},
		{
			id: "",
			fireAt: 0,
			type: AlertType.PREMIERE,
			title: name(2, "Show C"),
			body: "8 new episodes",
			lines: [...batch.slice(0, 5), "+3 more"],
			...art(shows[2], 1, 1, true, 8),
		},
		{
			id: "",
			fireAt: 0,
			type: AlertType.MORNING,
			title: `${morning.length} Episodes to Watch Today`,
			body: [name(0, "Show A"), name(1, "Show B"), name(3, "Show D")].join(", "),
			lines: morning,
		},
		{
			id: "",
			fireAt: 0,
			type: AlertType.MOVIE,
			title: movie?.title ?? "Movie",
			body: "Out today",
			...(movie?.backdropPath
				? { image: { picturePath: movie.backdropPath, ...(movie.logoPath ? { logoPath: movie.logoPath } : {}) } }
				: {}),
		},
		{ id: "", fireAt: 0, type: AlertType.MOVIE_REMINDER, title: movie?.title ?? "Movie", body: "Out in 7 days" },
		{
			id: "",
			fireAt: 0,
			type: AlertType.DIGEST,
			title: "Your Week Ahead",
			body: `${[name(0, "Show A"), name(1, "Show B"), name(2, "Show C")].join(", ")}, +2 more`,
		},
		{ id: "", fireAt: 0, type: AlertType.NUDGE, title: "Watchloom", body: "Open Watchloom to keep your episode alerts coming." },
	];
	for (const [i, a] of samples.entries()) {
		await Notifications.scheduleNotificationAsync({
			identifier: `${DEBUG_ALERT_ID}-sample-${i}`,
			content: { title: a.title, body: a.body, data: alertData(a) },
			trigger: { channelId: AIRING_CHANNEL },
		});
	}
	return samples.length;
}
