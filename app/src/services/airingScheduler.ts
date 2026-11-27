import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuth } from "@react-native-firebase/auth";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
	AIRING_CHANNEL,
	ALERT_ID,
	AlertPriority,
	AlertType,
	CacheKey,
	LockVisibility,
	MediaType,
	PictureStyle,
	ReplanSource,
	WatchStatus,
} from "../enums";
import { readSavedTracking } from "../hooks/trackingStore";
import {
	anyAlertOn,
	buildAiringPlan,
	episodeCode,
	AIRING_TODAY,
	moreEpisodes,
	mergeOverrides,
	oneOffTime,
	pruneOverrides,
	toPlanTitle,
	topicDocIds,
	type AiringOverride,
	type PlannedAlert,
	type PlanTitle,
} from "../utils/airingPlan";
import { parseAiringPush } from "../utils/airingPush";
import { showDocId } from "../utils/docId";
import { titleSilenced, type NotifyPrefs } from "../utils/notifyConfig";
import { diffTitles, movedEpisodes, parseSeen, type TitleEvent } from "../utils/notifyEvents";
import { loadNotifyPrefs } from "./notifyPrefs";
import { syncTitleTopics } from "./titleTopics";
import { TMDB_IMAGE_BASE } from "../theme";
import type { FirebaseMessagingTypes } from "@react-native-firebase/messaging";

/** Notification id of the dev-only "fake airing" (never planned, so a re-plan leaves it alone) */
const DEBUG_ALERT_ID = "debug-airing";
const OUR_PREFIXES: string[] = [
	ALERT_ID.AIR,
	ALERT_ID.MORNING,
	ALERT_ID.DIGEST,
	ALERT_ID.MOVIE,
	ALERT_ID.REMINDER,
	ALERT_ID.NUDGE,
	ALERT_ID.HEADSUP,
	ALERT_ID.DAILY,
	ALERT_ID.BACKLOG,
	ALERT_ID.OVERFLOW,
];

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

/** Foreground notifications show as a banner too (with a sound when the sound setting is on) */
export function configureAlertDisplay(): void {
	Notifications.setNotificationHandler({
		handleNotification: async () => ({
			shouldShowBanner: true,
			shouldShowList: true,
			shouldPlaySound: (await loadNotifyPrefs().catch(() => null))?.look.sound ?? false,
			shouldSetBadge: false,
		}),
	});
}

const IMPORTANCE = {
	[AlertPriority.HIGH]: Notifications.AndroidImportance.HIGH,
	[AlertPriority.DEFAULT]: Notifications.AndroidImportance.DEFAULT,
	[AlertPriority.LOW]: Notifications.AndroidImportance.LOW,
};
const VISIBILITY = {
	[LockVisibility.PUBLIC]: Notifications.AndroidNotificationVisibility.PUBLIC,
	[LockVisibility.PRIVATE]: Notifications.AndroidNotificationVisibility.PRIVATE,
	[LockVisibility.SECRET]: Notifications.AndroidNotificationVisibility.SECRET,
};

/**
 * The channel for the look settings. Android fixes a channel's importance, sound and vibration once created, so each
 * combination gets its own id; scheduled alerts name theirs, so a change re-plans them onto the new one
 */
function channelFor(look: NotifyPrefs["look"]): string {
	return `${AIRING_CHANNEL}-${look.priority}-${look.sound ? "s" : "q"}${look.vibrate ? "v" : "n"}-${look.visibility}`;
}

async function ensureChannel(look?: NotifyPrefs["look"]): Promise<string> {
	if (Platform.OS !== "android") return AIRING_CHANNEL;
	if (!look) {
		await Notifications.setNotificationChannelAsync(AIRING_CHANNEL, {
			name: "Airing Alerts",
			importance: Notifications.AndroidImportance.HIGH,
		});
		return AIRING_CHANNEL;
	}
	const id = channelFor(look);
	await Notifications.setNotificationChannelAsync(id, {
		name: "Airing Alerts",
		importance: IMPORTANCE[look.priority],
		// Left out = the system default sound; null = silent ("default" would look for a custom sound file)
		...(look.sound ? {} : { sound: null }),
		enableVibrate: look.vibrate,
		...(look.vibrate ? { vibrationPattern: [0, 250, 250, 250] } : {}),
		lockscreenVisibility: VISIBILITY[look.visibility],
	});
	// Earlier combinations are dropped so the system settings list one "Airing Alerts" channel
	const all = await Notifications.getNotificationChannelsAsync().catch(() => []);
	for (const c of all) {
		if (c.id.startsWith(`${AIRING_CHANNEL}-`) && c.id !== id) {
			await Notifications.deleteNotificationChannelAsync(c.id).catch(() => {});
		}
	}
	return id;
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
function alertData(a: PlannedAlert, channel = ""): Record<string, string | number> {
	return {
		alert: a.type,
		// Which channel it was scheduled on: a look change reschedules it onto the new one
		...(channel ? { channel } : {}),
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

async function applyPlan(plan: PlannedAlert[], channel: string): Promise<{ scheduled: number; cancelled: number }> {
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
		const data = alertData(a, channel);
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
			trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: a.fireAt, channelId: channel },
		});
		scheduled++;
	}
	return { scheduled, cancelled };
}

/** A one-off alert (ended / new season / moved air time), shown now or at the quiet-hours morning */
async function postEvent(ev: TitleEvent, prefs: NotifyPrefs, now: number, channel: string): Promise<void> {
	const fireAt = oneOffTime(prefs, now);
	if (fireAt === null) return;
	const content = {
		title: ev.title,
		body: ev.body,
		data: { alert: ev.type, docId: ev.docId, tmdbId: ev.tmdbId, mediaType: ev.mediaType, channel },
	};
	await Notifications.scheduleNotificationAsync({
		identifier: `${ALERT_ID.EVENT}${ev.key}`,
		content,
		trigger:
			fireAt > now + 5000
				? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt, channelId: channel }
				: { channelId: channel },
	});
}

/**
 * Compares the tracked shows with the last snapshot: a show that ended or a new season posts an alert (when its
 * switch is on and the title isn't muted). The snapshot advances either way, so turning a switch on later doesn't
 * replay old changes
 */
async function postTitleEvents(titles: PlanTitle[], prefs: NotifyPrefs, now: number, channel: string): Promise<void> {
	const tracked = titles.filter(
		(t) => t.mediaType === MediaType.TV && t.status !== WatchStatus.PAUSED && t.status !== WatchStatus.PAUSED_REWATCH,
	);
	const seen = parseSeen(await AsyncStorage.getItem(CacheKey.NOTIFY_SEEN).catch(() => null));
	const { events, next } = diffTitles(seen, tracked);
	await AsyncStorage.setItem(CacheKey.NOTIFY_SEEN, JSON.stringify(next)).catch(() => {});
	for (const ev of events) {
		const on = ev.type === AlertType.SERIES_ENDED ? prefs.seriesEnded.on : prefs.newSeason.on;
		if (on && !titleSilenced(prefs, ev.docId, now)) await postEvent(ev, prefs, now, channel);
	}
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
	const channel = await ensureChannel(prefs.look);
	const applied = await applyPlan(plan, channel);
	await postTitleEvents(titles, prefs, now, channel).catch(() => {});
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
	await AsyncStorage.removeMany([CacheKey.AIRING_UID, CacheKey.AIRING_OVERRIDES, CacheKey.NOTIFY_SEEN]).catch(() => {});
}

/** An airing push (app open: onMessage; closed: the background handler in index.ts). True when it was one */
export async function handleAiringMessage(message: FirebaseMessagingTypes.RemoteMessage): Promise<boolean> {
	const push = parseAiringPush(message.data);
	if (!push) return false;
	if (push.overrides.length) {
		const existing = await loadOverrides();
		// "Moved" alerts: compared with what this device knew before the correction
		const prefs = await loadNotifyPrefs();
		const uid = prefs.dateChanged.on ? await planUid() : null;
		if (uid) {
			const { titles } = await planTitles(uid);
			const now = Date.now();
			const moved = movedEpisodes(titles, existing, push.overrides, now).filter((ev) => !titleSilenced(prefs, ev.docId, now));
			if (moved.length > 0) {
				const channel = await ensureChannel(prefs.look);
				for (const ev of moved) await postEvent(ev, prefs, now, channel).catch(() => {});
			}
		}
		const merged = mergeOverrides(existing, push.overrides);
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

/** One entry of the "Send a test alert" picker */
export interface SampleAlert {
	key: string;
	label: string;
	hint: string;
	alert: PlannedAlert;
}

const DUMMY_EPISODE_NAMES = ["The One With the Test Alert", "Pilot Light", "A Very Long Night", "Season Finale Energy", "The Return"];

/**
 * Sample alerts for the picker: built from the saved titles (their real names, stills, backdrops and logos), or with
 * dummy names and no pictures when nothing is tracked yet. The look settings apply, so spoiler-safe (no episode names,
 * no stills) and text only show up here as they will in real alerts. `realTitles` = a tracked show / movie was used
 */
export async function buildSampleAlerts(prefs: NotifyPrefs): Promise<{ samples: SampleAlert[]; realTitles: boolean }> {
	const uid = await planUid();
	const { titles } = uid ? await planTitles(uid) : { titles: [] as PlanTitle[] };
	const shows = titles.filter((t) => t.mediaType === MediaType.TV);
	const movie =
		titles.find((t) => t.mediaType === MediaType.MOVIE && t.backdropPath && t.logoPath) ??
		titles.find((t) => t.mediaType === MediaType.MOVIE && t.backdropPath) ??
		titles.find((t) => t.mediaType === MediaType.MOVIE);
	const spoiler = prefs.look.spoilerSafe;
	const plain = prefs.look.picture === PictureStyle.PLAIN;
	const name = (i: number, fallback: string) => shows[i]?.title ?? fallback;
	const epName = (t: PlanTitle | undefined, s: number, e: number) => {
		if (spoiler) return "";
		if (!t) return ` · ${DUMMY_EPISODE_NAMES[(s + e) % DUMMY_EPISODE_NAMES.length]}`;
		const n = t.seasons.find((x) => x.seasonNumber === s)?.episodes.find((x) => x.episodeNumber === e)?.title;
		return n && !/^Episode \d+$/i.test(n) ? ` · ${n}` : "";
	};
	const row = (t: PlanTitle | undefined, s: number, e: number) => `S${s} E${e}${epName(t, s, e)}`;
	const still = (t: PlanTitle | undefined, s: number, e: number) =>
		t?.seasons.find((x) => x.seasonNumber === s)?.episodes.find((x) => x.episodeNumber === e)?.stillPath ?? undefined;
	/** The picture the planner would give: still (episode) or backdrop (premiere / spoiler-safe), logo, caption */
	const art = (
		t: PlanTitle | undefined,
		s: number,
		e: number,
		kind: "episode" | "premiere" | "finale",
		count = 1,
	): Partial<PlannedAlert> => {
		if (plain) return {};
		const st = still(t, s, e);
		const backdropFirst = kind !== "episode" || spoiler;
		const picturePath = spoiler ? t?.backdropPath : backdropFirst ? (t?.backdropPath ?? st) : (st ?? t?.backdropPath);
		if (!picturePath) return {};
		const n = epName(t, s, e).replace(/^ · /, "");
		const code = episodeCode(s, e);
		const first = kind === "premiere" ? `Season ${s} Premiere` : kind === "finale" ? `Season ${s} Finale` : n ? `${code} · ${n}` : code;
		return {
			image: {
				picturePath,
				...(picturePath === st ? { still: true } : {}),
				...(t?.logoPath ? { logoPath: t.logoPath } : {}),
				caption: [first, ...(count > 1 ? [moreEpisodes(count - 1)] : [])],
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
	const b0 = epWithStill(shows[1] ?? shows[0]);
	const batchShow = shows[2] ?? shows[0];
	const batch = Array.from({ length: 8 }, (_, i) => (i === 0 ? `Season 1 premiere${epName(batchShow, 1, 1)}` : row(batchShow, 1, i + 1)));
	const morning = [
		`${name(0, "Show A")} · ${row(shows[0], 1, 4)}`,
		`${name(1, "Show B")} · ${row(shows[1], 2, 6)}`,
		`${name(1, "Show B")} · ${row(shows[1], 2, 7)}`,
		`${name(3, "Show D")} · Season 2 premiere${epName(shows[3], 2, 1)}`,
	];
	const movieTitle = movie?.title ?? "Sample Movie";
	const make = (key: string, label: string, hint: string, alert: Omit<PlannedAlert, "id" | "fireAt">): SampleAlert => ({
		key,
		label,
		hint,
		alert: { id: "", fireAt: 0, ...alert },
	});
	const samples: SampleAlert[] = [
		make("episode", "New episode", "One episode, with its picture", {
			type: AlertType.EPISODE,
			title: name(0, "Show A"),
			body: row(shows[0], a0.s, a0.e),
			...art(shows[0], a0.s, a0.e, "episode"),
		}),
		make("episodes", "Several episodes", "Three at once, expanded rows", {
			type: AlertType.EPISODE,
			title: name(1, "Show B"),
			body: "3 new episodes",
			lines: [row(shows[1], b0.s, b0.e), row(shows[1], b0.s, b0.e + 1), row(shows[1], b0.s, b0.e + 2)],
			...art(shows[1] ?? shows[0], b0.s, b0.e, "episode", 3),
		}),
		make("premiere", "Season premiere", "Backdrop with the season on it", {
			type: AlertType.PREMIERE,
			title: name(1, "Show B"),
			body: `Season 2 premiere${epName(shows[1], 2, 1)}`,
			...art(shows[1], 2, 1, "premiere"),
		}),
		make("finale", "Season finale", "The last episode of a season", {
			type: AlertType.FINALE,
			title: name(0, "Show A"),
			body: `Season 1 finale${epName(shows[0], 1, 8)}`,
			...art(shows[0], 1, 8, "finale"),
		}),
		make("batch", "A whole season", "Eight episodes, rows then \"+3 more\"", {
			type: AlertType.PREMIERE,
			title: batchShow?.title ?? "Show C",
			body: "8 new episodes",
			lines: [...batch.slice(0, 5), "+3 more"],
			...art(batchShow, 1, 1, "premiere", 8),
		}),
		make("morning", "Overnight group", "Several shows held by quiet hours", {
			type: AlertType.MORNING,
			title: `${morning.length} Episodes to Watch Today`,
			body: [name(0, "Show A"), name(1, "Show B"), name(3, "Show D")].join(", "),
			lines: morning,
		}),
		make("movie", "Movie out today", "Backdrop with the title logo", {
			type: AlertType.MOVIE,
			title: movieTitle,
			body: "Out today",
			...(!plain && movie?.backdropPath
				? { image: { picturePath: movie.backdropPath, ...(movie.logoPath ? { logoPath: movie.logoPath } : {}) } }
				: {}),
		}),
		make("reminder", "Movie reminder", "A week before release", {
			type: AlertType.MOVIE_REMINDER,
			title: movieTitle,
			body: "Out in 7 days",
		}),
		make("headsup", "Premiere heads-up", "The day before", {
			type: AlertType.HEADSUP,
			title: name(1, "Show B"),
			body: "Season 2 premieres tomorrow",
		}),
		make("digest", "Weekly digest", "What is coming up", {
			type: AlertType.DIGEST,
			title: "Your Week Ahead",
			body: `${[name(0, "Show A"), name(1, "Show B"), name(2, "Show C")].join(", ")}, +2 more`,
		}),
		make("daily", "Daily digest", "What airs today", {
			type: AlertType.DAILY,
			title: "Airing Today",
			body: `${name(0, "Show A")}, ${name(1, "Show B")}`,
		}),
		make("backlog", "Catch-up reminder", "Unwatched episodes", {
			type: AlertType.BACKLOG,
			title: "Catch Up",
			body: "6 unwatched episodes across 2 shows",
		}),
		make("ended", "Show ended", "A tracked show got its final status", {
			type: AlertType.SERIES_ENDED,
			title: name(2, "Show C"),
			body: "Has ended",
		}),
		make("newseason", "New season announced", "With its premiere date", {
			type: AlertType.NEW_SEASON,
			title: name(3, "Show D"),
			body: "Season 3 announced · Fri 8 Jan",
		}),
		make("moved", "Air date changed", "An episode moved", {
			type: AlertType.DATE_CHANGED,
			title: name(4, "Show E"),
			body: "S2 E3 moved to Sat 9 Jan, 8:00 pm",
		}),
		make("nudge", "Reopen reminder", "After a while away", {
			type: AlertType.NUDGE,
			title: "Watchloom",
			body: "Open Watchloom to keep your episode alerts coming.",
		}),
		make("plain", "Plain test", "Just sound, vibration and lock screen", {
			type: AlertType.NUDGE,
			title: "Watchloom",
			body: "This is how your alerts arrive",
		}),
	];
	return { samples, realTitles: shows.length > 0 };
}

/**
 * Posts one sample right now on the channel the look settings use (so sound, vibration and lock-screen visibility
 * apply too). False when notifications are off for the app. Ids are outside OUR_PREFIXES: a re-plan leaves them alone
 */
export async function sendSampleAlert(sample: SampleAlert, prefs: NotifyPrefs): Promise<boolean> {
	if (Platform.OS !== "android") return false;
	const permission = await Notifications.getPermissionsAsync();
	if (!permission.granted) return false;
	const channel = await ensureChannel(prefs.look);
	const a = sample.alert;
	await Notifications.scheduleNotificationAsync({
		identifier: `${DEBUG_ALERT_ID}-sample-${sample.key}`,
		content: { title: a.title, body: a.body, data: alertData(a, channel) },
		trigger: { channelId: channel },
	});
	return true;
}

/** Dev only (Settings → Updates (test)): every sample at once, with the saved look settings */
export async function sendSampleAlerts(): Promise<number> {
	if (Platform.OS !== "android") return 0;
	const prefs = await loadNotifyPrefs();
	const { samples } = await buildSampleAlerts(prefs);
	let sent = 0;
	for (const s of samples) if (await sendSampleAlert(s, prefs).catch(() => false)) sent++;
	return sent;
}

/** The titles this device can alert about (tracked, with a cached catalog entry), by name — for the mute list */
export async function listTrackedTitles(): Promise<{ docId: string; title: string; mediaType: MediaType; status: WatchStatus }[]> {
	const uid = await planUid();
	if (!uid) return [];
	const { titles } = await planTitles(uid);
	return titles
		.map((t) => ({ docId: t.docId, title: t.title, mediaType: t.mediaType, status: t.status }))
		.sort((a, b) => a.title.localeCompare(b.title));
}
