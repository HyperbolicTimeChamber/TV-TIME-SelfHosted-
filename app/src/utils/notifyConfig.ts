import { AlertPriority, EpisodeScope, LockVisibility, NotifyPreset, PictureStyle, QuietMode } from "../enums";

/**
 * Settings → Notifications: everything a user can tune, saved per device (CacheKey.NOTIFY_PREFS).
 * Pure: the planner, the scheduler and the settings screens all read this shape
 */

/** Hours are local 0–23; weekdays follow Date.getDay() (0 = Sunday) */
export interface NotifyPrefs {
	/** All alerts: off for good (until = 0) or snoozed until a time (ms) */
	pause: { on: boolean; until: number };
	/** Away: nothing alerts from `from` to `to` (local YYYY-MM-DD, inclusive) */
	vacation: { on: boolean; from: string; to: string };
	episodes: {
		on: boolean;
		scope: EpisodeScope;
		skipSpecials: boolean;
		/** Minutes before air time (0 = at air time); only for episodes with an exact air time */
		leadMin: number;
	};
	premieres: { on: boolean; dayBefore: boolean };
	finales: { on: boolean };
	/** A tracked show ends or is cancelled */
	seriesEnded: { on: boolean };
	/** A new season shows up in a tracked show's catalog */
	newSeason: { on: boolean };
	/** An episode's air time moves (pushed correction) */
	dateChanged: { on: boolean };
	movies: { releaseOn: boolean; remindOn: boolean; /** days before release */ remindDays: number[] };
	weeklyDigest: { on: boolean; weekday: number; hour: number; /** days ahead covered */ windowDays: number };
	dailyDigest: { on: boolean; hour: number };
	/** Weekly "N episodes waiting" for shows the user fell behind on */
	backlog: { on: boolean; weekday: number; hour: number };
	/** Reopen reminder after `days` without opening the app */
	nudge: { on: boolean; days: number };
	quiet: {
		on: boolean;
		startHour: number;
		endHour: number;
		/** Hour deferred alerts arrive */
		morningHour: number;
		/** Weekdays whose quiet period applies (by the day the alert would land) */
		days: number[];
		mode: QuietMode;
	};
	timing: {
		/** Hour for alerts with only a date (untimed episodes, movie releases / reminders) */
		defaultHour: number;
		horizonDays: number;
		/** Alerts per day before the rest fold into one (0 = no cap) */
		maxPerDay: number;
	};
	grouping: {
		/** Overnight alerts of several titles arrive as one */
		overnight: boolean;
		/** Episodes of one title airing together are one alert */
		combineEpisodes: boolean;
		/** Rows an expanded alert lists before "+N more" */
		maxRows: number;
	};
	look: {
		picture: PictureStyle;
		/** Alerts name the episode by number only, with no title or still */
		spoilerSafe: boolean;
		priority: AlertPriority;
		visibility: LockVisibility;
		sound: boolean;
		vibrate: boolean;
	};
	/** docId → muted until (ms); 0 = for good */
	muted: Record<string, number>;
	/** Only the titles in `solo` alert */
	soloOnly: boolean;
	solo: string[];
}

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAYS_ALL = [0, 1, 2, 3, 4, 5, 6];
export const LEAD_MINUTES = [0, 15, 30, 60];

/**
 * Number settings: the slider runs `min`–`max`; a value typed beside it may go up to `custom` (never below `min`,
 * never negative). The parser clamps saved values to `min`–`custom`
 */
export interface NumberLimit {
	min: number;
	max: number;
	custom: number;
}
export const LIMITS = {
	snoozeDays: { min: 1, max: 14, custom: 365 },
	awayDays: { min: 1, max: 14, custom: 365 },
	remindDays: { min: 1, max: 14, custom: 365 },
	windowDays: { min: 1, max: 14, custom: 60 },
	nudgeDays: { min: 1, max: 30, custom: 365 },
	horizonDays: { min: 1, max: 30, custom: 60 },
	maxPerDay: { min: 0, max: 10, custom: 50 },
	maxRows: { min: 2, max: 10, custom: 20 },
} satisfies Record<string, NumberLimit>;

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
	pause: { on: false, until: 0 },
	vacation: { on: false, from: "", to: "" },
	episodes: { on: true, scope: EpisodeScope.CAUGHT_UP, skipSpecials: false, leadMin: 0 },
	premieres: { on: true, dayBefore: false },
	finales: { on: false },
	seriesEnded: { on: false },
	newSeason: { on: false },
	dateChanged: { on: false },
	movies: { releaseOn: true, remindOn: true, remindDays: [7] },
	weeklyDigest: { on: true, weekday: 0, hour: 9, windowDays: 7 },
	dailyDigest: { on: false, hour: 9 },
	backlog: { on: false, weekday: 6, hour: 10 },
	nudge: { on: true, days: 25 },
	quiet: { on: true, startHour: 22, endHour: 8, morningHour: 9, days: WEEKDAYS_ALL, mode: QuietMode.DEFER },
	timing: { defaultHour: 9, horizonDays: 30, maxPerDay: 0 },
	grouping: { overnight: true, combineEpisodes: true, maxRows: 6 },
	look: {
		picture: PictureStyle.RICH,
		spoilerSafe: false,
		priority: AlertPriority.HIGH,
		visibility: LockVisibility.PRIVATE,
		sound: true,
		vibrate: true,
	},
	muted: {},
	soloOnly: false,
	solo: [],
};

// ---- presets --------------------------------------------------------------------------------------

/** The alert-type part of the prefs: what a preset sets (timing, look, muted titles and pauses stay as they are) */
type PresetSlice = Pick<
	NotifyPrefs,
	| "episodes"
	| "premieres"
	| "finales"
	| "seriesEnded"
	| "newSeason"
	| "dateChanged"
	| "movies"
	| "weeklyDigest"
	| "dailyDigest"
	| "backlog"
	| "nudge"
>;

const D = DEFAULT_NOTIFY_PREFS;

const PRESET_SLICES: Record<Exclude<NotifyPreset, NotifyPreset.CUSTOM>, PresetSlice> = {
	[NotifyPreset.ESSENTIAL]: {
		episodes: { ...D.episodes, on: false },
		premieres: { on: true, dayBefore: false },
		finales: { on: false },
		seriesEnded: { on: false },
		newSeason: { on: false },
		dateChanged: { on: false },
		movies: { releaseOn: true, remindOn: false, remindDays: [7] },
		weeklyDigest: { ...D.weeklyDigest, on: true },
		dailyDigest: { ...D.dailyDigest, on: false },
		backlog: { ...D.backlog, on: false },
		nudge: { ...D.nudge, on: false },
	},
	[NotifyPreset.BALANCED]: {
		episodes: { ...D.episodes },
		premieres: { ...D.premieres },
		finales: { ...D.finales },
		seriesEnded: { ...D.seriesEnded },
		newSeason: { ...D.newSeason },
		dateChanged: { ...D.dateChanged },
		movies: { ...D.movies },
		weeklyDigest: { ...D.weeklyDigest },
		dailyDigest: { ...D.dailyDigest },
		backlog: { ...D.backlog },
		nudge: { ...D.nudge },
	},
	[NotifyPreset.EVERYTHING]: {
		episodes: { ...D.episodes, on: true, scope: EpisodeScope.WATCHING },
		premieres: { on: true, dayBefore: true },
		finales: { on: true },
		seriesEnded: { on: true },
		newSeason: { on: true },
		dateChanged: { on: true },
		movies: { releaseOn: true, remindOn: true, remindDays: [1, 7] },
		weeklyDigest: { ...D.weeklyDigest, on: true },
		dailyDigest: { ...D.dailyDigest, on: true },
		backlog: { ...D.backlog, on: true },
		nudge: { ...D.nudge, on: true, days: 14 },
	},
};

export const PRESET_LABELS: Record<NotifyPreset, { label: string; hint: string }> = {
	[NotifyPreset.ESSENTIAL]: { label: "Essential", hint: "Premieres, movie releases and a weekly digest" },
	[NotifyPreset.BALANCED]: { label: "Balanced", hint: "Plus every new episode and movie reminders (default)" },
	[NotifyPreset.EVERYTHING]: { label: "Everything", hint: "All of it: finales, ended shows, daily digest, backlog" },
	[NotifyPreset.CUSTOM]: { label: "Custom", hint: "Your own mix" },
};

const slice = (p: NotifyPrefs): PresetSlice => ({
	episodes: p.episodes,
	premieres: p.premieres,
	finales: p.finales,
	seriesEnded: p.seriesEnded,
	newSeason: p.newSeason,
	dateChanged: p.dateChanged,
	movies: p.movies,
	weeklyDigest: p.weeklyDigest,
	dailyDigest: p.dailyDigest,
	backlog: p.backlog,
	nudge: p.nudge,
});

/** The prefs with a preset's alert switches applied (everything else untouched) */
export function applyPreset(prefs: NotifyPrefs, preset: NotifyPreset): NotifyPrefs {
	if (preset === NotifyPreset.CUSTOM) return prefs;
	const s = PRESET_SLICES[preset];
	return JSON.parse(JSON.stringify({ ...prefs, ...s })) as NotifyPrefs;
}

/** Which preset the alert switches match (compared on the on/off + details a preset sets, not hours) */
export function presetOf(prefs: NotifyPrefs): NotifyPreset {
	const key = (s: PresetSlice) =>
		JSON.stringify([
			s.episodes.on,
			s.episodes.scope,
			s.premieres,
			s.finales.on,
			s.seriesEnded.on,
			s.newSeason.on,
			s.dateChanged.on,
			s.movies,
			s.weeklyDigest.on,
			s.dailyDigest.on,
			s.backlog.on,
			s.nudge.on,
			s.nudge.on ? s.nudge.days : 0,
		]);
	const mine = key(slice(prefs));
	for (const preset of Object.keys(PRESET_SLICES) as Exclude<NotifyPreset, NotifyPreset.CUSTOM>[]) {
		if (key(PRESET_SLICES[preset]) === mine) return preset;
	}
	return NotifyPreset.CUSTOM;
}

// ---- derived ---------------------------------------------------------------------------------------

/** All alerts are off for good */
export function pausedForever(prefs: NotifyPrefs): boolean {
	return prefs.pause.on && prefs.pause.until === 0;
}

/** Snoozed right now (a pause with an end that hasn't passed) */
export function snoozedUntil(prefs: NotifyPrefs, now: number): number {
	return prefs.pause.on && prefs.pause.until > now ? prefs.pause.until : 0;
}

/** Any alert type on (quiet hours and the look alone send nothing); a pause for good counts as none */
export function anyAlertOn(prefs: NotifyPrefs): boolean {
	if (pausedForever(prefs)) return false;
	return (
		prefs.episodes.on ||
		prefs.premieres.on ||
		prefs.finales.on ||
		prefs.seriesEnded.on ||
		prefs.newSeason.on ||
		prefs.dateChanged.on ||
		prefs.movies.releaseOn ||
		(prefs.movies.remindOn && prefs.movies.remindDays.length > 0) ||
		prefs.weeklyDigest.on ||
		prefs.dailyDigest.on ||
		prefs.backlog.on
	);
}

/** The title is muted (for good, or until a time that hasn't passed) or outside "only these" */
export function titleSilenced(prefs: NotifyPrefs, docId: string, now: number): boolean {
	const until = prefs.muted[docId];
	if (until !== undefined && (until === 0 || until > now)) return true;
	return prefs.soloOnly && !prefs.solo.includes(docId);
}

/** Local YYYY-MM-DD */
export function localDate(ms: number): string {
	const d = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The moment falls inside the vacation (its local day, bounds included) */
export function onVacation(prefs: NotifyPrefs, ms: number): boolean {
	const v = prefs.vacation;
	if (!v.on || !v.from || !v.to) return false;
	const day = localDate(ms);
	return day >= v.from && day <= v.to;
}

// ---- parsing ----------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const int = (v: unknown, fallback: number, min: number, max: number) =>
	typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
const oneOf = <T extends string>(v: unknown, all: readonly T[], fallback: T): T =>
	all.includes(v as T) ? (v as T) : fallback;
const text = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(v) ? v : "");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const hour = (v: unknown, fallback: number) => int(v, fallback, 0, 23);
const dayList = (v: unknown, fallback: number[]) =>
	Array.isArray(v)
		? [...new Set(v.filter((x): x is number => Number.isInteger(x) && x >= 0 && x <= 6))].sort()
		: fallback;

/** Old saves held five booleans (premieres, newEpisodes, movieReminders, weeklyDigest, quietHours) */
function fromLegacy(raw: Obj): NotifyPrefs {
	const p = parseNotifyObject({});
	p.premieres.on = bool(raw.premieres, true);
	p.movies.releaseOn = bool(raw.premieres, true);
	p.episodes.on = bool(raw.newEpisodes, true);
	p.movies.remindOn = bool(raw.movieReminders, true);
	p.weeklyDigest.on = bool(raw.weeklyDigest, true);
	p.quiet.on = bool(raw.quietHours, true);
	return p;
}

function parseNotifyObject(raw: Obj): NotifyPrefs {
	const d = DEFAULT_NOTIFY_PREFS;
	const o = (k: string): Obj => (isObj(raw[k]) ? (raw[k] as Obj) : {});
	const pause = o("pause");
	const vac = o("vacation");
	const ep = o("episodes");
	const pr = o("premieres");
	const mv = o("movies");
	const wd = o("weeklyDigest");
	const dd = o("dailyDigest");
	const bl = o("backlog");
	const nu = o("nudge");
	const qh = o("quiet");
	const tm = o("timing");
	const gr = o("grouping");
	const lk = o("look");
	const remind = Array.isArray(mv.remindDays)
		? [...new Set(mv.remindDays.filter((x): x is number => Number.isInteger(x) && x >= LIMITS.remindDays.min && x <= LIMITS.remindDays.custom))].sort((a, b) => a - b)
		: [...d.movies.remindDays];
	const mutedRaw = isObj(raw.muted) ? raw.muted : {};
	const muted: Record<string, number> = {};
	for (const [k, v] of Object.entries(mutedRaw)) if (typeof v === "number" && v >= 0) muted[k] = v;
	return {
		pause: { on: bool(pause.on, false), until: int(pause.until, 0, 0, Number.MAX_SAFE_INTEGER) },
		vacation: {
			on: bool(vac.on, false),
			from: text(vac.from, DATE_RE),
			to: text(vac.to, DATE_RE),
		},
		episodes: {
			on: bool(ep.on, d.episodes.on),
			scope: oneOf(ep.scope, Object.values(EpisodeScope), d.episodes.scope),
			skipSpecials: bool(ep.skipSpecials, false),
			leadMin: int(ep.leadMin, 0, 0, 240),
		},
		premieres: { on: bool(pr.on, d.premieres.on), dayBefore: bool(pr.dayBefore, false) },
		finales: { on: bool(o("finales").on, false) },
		seriesEnded: { on: bool(o("seriesEnded").on, false) },
		newSeason: { on: bool(o("newSeason").on, false) },
		dateChanged: { on: bool(o("dateChanged").on, false) },
		movies: {
			releaseOn: bool(mv.releaseOn, d.movies.releaseOn),
			remindOn: bool(mv.remindOn, d.movies.remindOn),
			remindDays: remind,
		},
		weeklyDigest: {
			on: bool(wd.on, d.weeklyDigest.on),
			weekday: int(wd.weekday, d.weeklyDigest.weekday, 0, 6),
			hour: hour(wd.hour, d.weeklyDigest.hour),
			windowDays: int(wd.windowDays, d.weeklyDigest.windowDays, LIMITS.windowDays.min, LIMITS.windowDays.custom),
		},
		dailyDigest: { on: bool(dd.on, false), hour: hour(dd.hour, d.dailyDigest.hour) },
		backlog: {
			on: bool(bl.on, false),
			weekday: int(bl.weekday, d.backlog.weekday, 0, 6),
			hour: hour(bl.hour, d.backlog.hour),
		},
		nudge: { on: bool(nu.on, d.nudge.on), days: int(nu.days, d.nudge.days, LIMITS.nudgeDays.min, LIMITS.nudgeDays.custom) },
		quiet: {
			on: bool(qh.on, d.quiet.on),
			startHour: hour(qh.startHour, d.quiet.startHour),
			endHour: hour(qh.endHour, d.quiet.endHour),
			morningHour: hour(qh.morningHour, d.quiet.morningHour),
			days: dayList(qh.days, [...d.quiet.days]),
			mode: oneOf(qh.mode, Object.values(QuietMode), d.quiet.mode),
		},
		timing: {
			defaultHour: hour(tm.defaultHour, d.timing.defaultHour),
			horizonDays: int(tm.horizonDays, d.timing.horizonDays, LIMITS.horizonDays.min, LIMITS.horizonDays.custom),
			maxPerDay: int(tm.maxPerDay, 0, LIMITS.maxPerDay.min, LIMITS.maxPerDay.custom),
		},
		grouping: {
			overnight: bool(gr.overnight, true),
			combineEpisodes: bool(gr.combineEpisodes, true),
			maxRows: int(gr.maxRows, d.grouping.maxRows, LIMITS.maxRows.min, LIMITS.maxRows.custom),
		},
		look: {
			picture: oneOf(lk.picture, Object.values(PictureStyle), d.look.picture),
			spoilerSafe: bool(lk.spoilerSafe, false),
			priority: oneOf(lk.priority, Object.values(AlertPriority), d.look.priority),
			visibility: oneOf(lk.visibility, Object.values(LockVisibility), d.look.visibility),
			sound: bool(lk.sound, true),
			vibrate: bool(lk.vibrate, true),
		},
		muted,
		soloOnly: bool(raw.soloOnly, false),
		solo: Array.isArray(raw.solo) ? raw.solo.filter((x): x is string => typeof x === "string") : [],
	};
}

/** Saved prefs (JSON) over the defaults: unknown or invalid values keep the default, the old five-switch format is migrated */
export function parseNotifyPrefs(raw: string | null | undefined): NotifyPrefs {
	if (!raw) return parseNotifyObject({});
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isObj(parsed)) return parseNotifyObject({});
		const legacy = ["premieres", "newEpisodes", "movieReminders", "weeklyDigest", "quietHours"].some(
			(k) => typeof parsed[k] === "boolean",
		);
		return legacy && !isObj(parsed.episodes) ? fromLegacy(parsed) : parseNotifyObject(parsed);
	} catch {
		return parseNotifyObject({});
	}
}
