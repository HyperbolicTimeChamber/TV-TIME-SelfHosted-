import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, AppState, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as Notifications from "expo-notifications";
import * as Battery from "expo-battery";
import * as IntentLauncher from "expo-intent-launcher";
import { colors, spacing, typography, themedStyles } from "../../theme";
import SwipeBackView, { useSwipeBackPop } from "../../components/SwipeBackView";
import { CircleBackButton, CIRCLE_BUTTON_SIZE } from "../../components/CircleButton";
import { ProfileStackParamList, Route } from "../../types";
import {
	AlertPriority,
	EpisodeScope,
	LockVisibility,
	NotifyPreset,
	PictureStyle,
	QuietMode,
} from "../../enums";
import { NOTIFICATIONS_FOOTER } from "../../utils/settingsOptions";
import {
	applyPreset,
	DEFAULT_NOTIFY_PREFS,
	LEAD_MINUTES,
	LIMITS,
	PRESET_LABELS,
	localDate,
	presetOf,
	snoozedUntil,
	type NotifyPrefs,
} from "../../utils/notifyConfig";
import { clockLabel, dayLabel } from "../../utils/notifyEvents";
import { loadNotifyPrefs, saveNotifyPrefs } from "../../services/notifyPrefs";
import { buildSampleAlerts, sendSampleAlert, type SampleAlert } from "../../services/airingScheduler";
import ConfirmModal from "../../components/modals/ConfirmModal";
import OptionsSheet, { type SheetOption } from "../../components/modals/OptionsSheet";
import {
	Chips,
	Detail,
	HourStepper,
	NumberSlider,
	Row,
	Section,
	SwitchRow,
	WeekdayChips,
	WeekdaysChips,
} from "./NotificationControls";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The test-alert picker's row icons, by sample key */
const SAMPLE_ICONS: Record<string, SheetOption["icon"]> = {
	episode: "tv-outline",
	episodes: "albums-outline",
	premiere: "sparkles-outline",
	finale: "flag-outline",
	batch: "layers-outline",
	morning: "moon-outline",
	movie: "film-outline",
	reminder: "alarm-outline",
	headsup: "notifications-outline",
	digest: "calendar-outline",
	daily: "today-outline",
	backlog: "time-outline",
	ended: "stop-circle-outline",
	newseason: "add-circle-outline",
	moved: "swap-horizontal-outline",
	nudge: "refresh-outline",
	plain: "chatbubble-outline",
};

/** How the snooze is set: not at all, for a number of days (the slider), or until turned back on */
enum Snooze {
	OFF = "off",
	DAYS = "days",
	FOREVER = "forever",
}
const SNOOZE_OPTIONS = [
	{ value: Snooze.OFF, label: "Off" },
	{ value: Snooze.DAYS, label: "For a while" },
	{ value: Snooze.FOREVER, label: "Until I turn it on" },
];
const PRESET_OPTIONS = (Object.keys(PRESET_LABELS) as NotifyPreset[]).map((value) => ({
	value,
	label: PRESET_LABELS[value].label,
}));
const SCOPE_OPTIONS = [
	{ value: EpisodeScope.CAUGHT_UP, label: "Caught up" },
	{ value: EpisodeScope.WATCHING, label: "Watching" },
	{ value: EpisodeScope.TRACKED, label: "All tracked" },
];
const SCOPE_HINTS: Record<EpisodeScope, string> = {
	[EpisodeScope.CAUGHT_UP]: "Shows you're watching and have no unwatched episodes of",
	[EpisodeScope.WATCHING]: "Every show you're watching, caught up or not",
	[EpisodeScope.TRACKED]: "Every show you track that isn't paused",
};
const LEAD_OPTIONS = LEAD_MINUTES.map((value) => ({
	value,
	label: value === 0 ? "At air time" : value === 60 ? "1 hour before" : `${value} min before`,
}));
const QUIET_MODE_OPTIONS = [
	{ value: QuietMode.DEFER, label: "Hold till morning" },
	{ value: QuietMode.IMPORTANT, label: "Let big ones through" },
	{ value: QuietMode.DROP, label: "Skip them" },
];
const QUIET_MODE_HINTS: Record<QuietMode, string> = {
	[QuietMode.DEFER]: "Overnight alerts wait and arrive together",
	[QuietMode.IMPORTANT]: "Premieres, finales and movie releases still arrive; the rest wait",
	[QuietMode.DROP]: "Alerts that land in quiet hours are never sent",
};
const PICTURE_OPTIONS = [
	{ value: PictureStyle.RICH, label: "With picture" },
	{ value: PictureStyle.PLAIN, label: "Text only" },
];
const PRIORITY_OPTIONS = [
	{ value: AlertPriority.HIGH, label: "Pop up" },
	{ value: AlertPriority.DEFAULT, label: "Normal" },
	{ value: AlertPriority.LOW, label: "Silent" },
];
const VISIBILITY_OPTIONS = [
	{ value: LockVisibility.PUBLIC, label: "Show all" },
	{ value: LockVisibility.PRIVATE, label: "Hide details" },
	{ value: LockVisibility.SECRET, label: "Hide it" },
];

const deepCopy = (p: NotifyPrefs): NotifyPrefs => JSON.parse(JSON.stringify(p));

/** Date + hour of a snooze end, e.g. "Fri 20 Nov, 8:00 pm" */
const when = (ms: number) => `${dayLabel(localDate(ms))}, ${clockLabel(ms)}`;

/** Settings → Notifications: per-device alert settings (saved on this device, no network) + what blocks them */
export default function NotificationsScreen() {
	const { top } = useSafeAreaInsets();
	const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
	const swipeBack = useSwipeBackPop(navigation);
	const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_NOTIFY_PREFS);
	const [permissionDenied, setPermissionDenied] = useState(false);
	const [batteryRestricted, setBatteryRestricted] = useState(false);
	const [testMessage, setTestMessage] = useState("");

	useEffect(() => {
		loadNotifyPrefs().then(setPrefs);
	}, []);

	// What blocks alerts: re-read on return from the system settings
	const checkStatus = useCallback(async () => {
		if (Platform.OS !== "android") return;
		const permission = await Notifications.getPermissionsAsync().catch(() => null);
		setPermissionDenied(permission ? !permission.granted : false);
		const optimised = await Battery.isBatteryOptimizationEnabledAsync().catch(() => false);
		setBatteryRestricted(optimised);
	}, []);
	useEffect(() => {
		checkStatus();
		const sub = AppState.addEventListener("change", (state) => {
			if (state === "active") checkStatus();
		});
		return () => sub.remove();
	}, [checkStatus]);

	// The latest edit is saved a moment after the last change (a slider drag changes it many times a second);
	// leaving the screen saves what is pending
	const pending = useRef<NotifyPrefs | null>(null);
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const flush = useCallback(() => {
		if (saveTimer.current) clearTimeout(saveTimer.current);
		saveTimer.current = null;
		if (pending.current) saveNotifyPrefs(pending.current).catch(() => {});
		pending.current = null;
	}, []);
	useEffect(() => flush, [flush]);

	/** Edits a copy, shows it at once and saves it (the scheduler re-plans a moment later) */
	const edit = (change: (next: NotifyPrefs) => void) => {
		const next = deepCopy(prefs);
		change(next);
		setPrefs(next);
		pending.current = next;
		if (saveTimer.current) clearTimeout(saveTimer.current);
		saveTimer.current = setTimeout(flush, 350);
	};

	const now = Date.now();
	const snoozedTo = snoozedUntil(prefs, now);
	const snoozeMode = prefs.pause.on ? (prefs.pause.until === 0 ? Snooze.FOREVER : snoozedTo ? Snooze.DAYS : Snooze.OFF) : Snooze.OFF;
	const snoozeDays = snoozedTo ? Math.max(1, Math.ceil((snoozedTo - now) / DAY_MS)) : 1;
	const setSnoozeDays = (days: number) => edit((p) => void (p.pause = { on: true, until: Date.now() + days * DAY_MS }));
	const setSnooze = (value: Snooze) => {
		if (value === Snooze.DAYS) setSnoozeDays(snoozeDays);
		else edit((p) => void (p.pause = { on: value === Snooze.FOREVER, until: 0 }));
	};
	const setAway = (days: number) =>
		edit((p) => {
			p.vacation = { on: true, from: localDate(Date.now()), to: localDate(Date.now() + (days - 1) * DAY_MS) };
		});
	const awayDays = prefs.vacation.on && prefs.vacation.from && prefs.vacation.to
		? Math.round((Date.parse(`${prefs.vacation.to}T00:00:00`) - Date.parse(`${prefs.vacation.from}T00:00:00`)) / DAY_MS) + 1
		: 0;

	// Movie reminders: up to two, each a number of days before release
	const remindFirst = prefs.movies.remindDays[0] ?? 7;
	const remindSecond = prefs.movies.remindDays[1] ?? null;
	const setReminders = (first: number, second: number | null) =>
		edit((p) => void (p.movies.remindDays = second === null || second === first ? [first] : [first, second]));

	const preset = presetOf(prefs);
	const mutedCount = Object.keys(prefs.muted).length;
	const titlesHint = prefs.soloOnly
		? `Only ${prefs.solo.length} chosen title${prefs.solo.length === 1 ? "" : "s"} alert`
		: mutedCount > 0
			? `${mutedCount} muted`
			: "Mute a show or movie, or only follow a few";

	// "Send a test alert": pick which kind to preview (built with the current look settings)
	const [picker, setPicker] = useState<{ samples: SampleAlert[]; realTitles: boolean } | null>(null);
	const openPicker = async () => {
		const built = await buildSampleAlerts(prefs).catch(() => null);
		if (built) setPicker(built);
	};
	const sendSample = async (sample: SampleAlert) => {
		const ok = await sendSampleAlert(sample, prefs).catch(() => false);
		setTestMessage(ok ? `Sent “${sample.label}”. It should appear in a moment.` : "Couldn't send: check that notifications are allowed for Watchloom.");
	};

	const [resetOpen, setResetOpen] = useState(false);
	const reset = () => {
		const next = deepCopy(DEFAULT_NOTIFY_PREFS);
		setPrefs(next);
		pending.current = next;
		flush();
		setResetOpen(false);
	};

	return (
		<SwipeBackView onBack={() => navigation.goBack()} {...swipeBack} style={styles.container}>
			<ScrollView style={{ paddingTop: top }} contentContainerStyle={styles.scrollContent}>
				<View style={styles.headerRow}>
					<CircleBackButton onPress={() => navigation.goBack()} />
					<Text style={styles.headerTitle}>Notifications</Text>
					<View style={styles.headerSpacer} />
				</View>

				{permissionDenied || batteryRestricted ? (
					<Section>
						{permissionDenied ? (
							<Row
								first
								label="Open the system notification settings"
								onPress={() => IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APP_NOTIFICATION_SETTINGS)}
							>
								<View style={styles.textWrap}>
									<Text style={[styles.rowText, styles.rowTextDanger]}>Notifications are off for Watchloom</Text>
									<Text style={styles.rowHint}>Tap to open the system settings</Text>
								</View>
							</Row>
						) : null}
						{batteryRestricted ? (
							<Row
								first={!permissionDenied}
								label="Open the system battery settings"
								onPress={() => IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS)}
							>
								<View style={styles.textWrap}>
									<Text style={styles.rowText}>Battery optimisation may delay alerts</Text>
									<Text style={styles.rowHint}>Tap to open the system battery settings</Text>
								</View>
							</Row>
						) : null}
					</Section>
				) : null}

				{/* Pause / away */}
				<Section title="Pause">
					<Row first>
						<View style={styles.textWrap}>
							<Text style={styles.rowText}>Snooze all alerts</Text>
							<Text style={styles.rowHint}>
								{snoozedTo ? `Snoozed until ${when(snoozedTo)}` : prefs.pause.on ? "Off until you turn it back on" : "Alerts are on"}
							</Text>
						</View>
					</Row>
					<Detail label="Snooze">
						<Chips options={SNOOZE_OPTIONS} value={snoozeMode} onChange={setSnooze} />
					</Detail>
					{snoozeMode === Snooze.DAYS ? (
						<Detail label="For" hint="Slide, or type any number of days">
							<NumberSlider label="Snooze days" value={snoozeDays} limit={LIMITS.snoozeDays} unit="day" onChange={setSnoozeDays} />
						</Detail>
					) : null}
					<SwitchRow
						label="Vacation mode"
						hint={
							prefs.vacation.on && awayDays > 0
								? `Nothing alerts ${dayLabel(prefs.vacation.from)} to ${dayLabel(prefs.vacation.to)}`
								: "Nothing alerts while you're away"
						}
						value={prefs.vacation.on}
						onChange={(on) => (on ? setAway(7) : edit((p) => void (p.vacation = { on: false, from: "", to: "" })))}
					/>
					{prefs.vacation.on ? (
						<Detail label="Away for (starting today)">
							<NumberSlider label="Away days" value={Math.max(1, awayDays)} limit={LIMITS.awayDays} unit="day" onChange={setAway} />
						</Detail>
					) : null}
				</Section>

				{/* Presets */}
				<Section title="Quick setup">
					<Detail label="Pick a starting point" hint={PRESET_LABELS[preset].hint}>
						<Chips
							options={PRESET_OPTIONS}
							value={preset}
							onChange={(value) => {
								if (value !== NotifyPreset.CUSTOM) edit((p) => Object.assign(p, applyPreset(p, value)));
							}}
						/>
					</Detail>
				</Section>

				{/* Episodes and seasons */}
				<Section title="Shows">
					<SwitchRow
						first
						label="New episodes"
						hint="When an episode of a show you track airs"
						value={prefs.episodes.on}
						onChange={(v) => edit((p) => void (p.episodes.on = v))}
					/>
					{prefs.episodes.on ? (
						<>
							<Detail label="Which shows" hint={SCOPE_HINTS[prefs.episodes.scope]}>
								<Chips options={SCOPE_OPTIONS} value={prefs.episodes.scope} onChange={(v) => edit((p) => void (p.episodes.scope = v))} />
							</Detail>
							<Detail label="When it arrives" hint="Only for episodes with an exact air time">
								<Chips options={LEAD_OPTIONS} value={prefs.episodes.leadMin} onChange={(v) => edit((p) => void (p.episodes.leadMin = v))} />
							</Detail>
							<SwitchRow
								label="Skip specials"
								hint="Leave out season 0 extras"
								value={prefs.episodes.skipSpecials}
								onChange={(v) => edit((p) => void (p.episodes.skipSpecials = v))}
							/>
						</>
					) : null}
					<SwitchRow
						label="Season premieres"
						hint="When a new season of a show you track starts"
						value={prefs.premieres.on}
						onChange={(v) => edit((p) => void (p.premieres.on = v))}
					/>
					{prefs.premieres.on ? (
						<SwitchRow
							label="Heads-up the day before"
							value={prefs.premieres.dayBefore}
							onChange={(v) => edit((p) => void (p.premieres.dayBefore = v))}
						/>
					) : null}
					<SwitchRow
						label="Season finales"
						hint="The last episode of a season, or the series finale when the show ends"
						value={prefs.finales.on}
						onChange={(v) => edit((p) => void (p.finales.on = v))}
					/>
					<SwitchRow
						label="Show ended or cancelled"
						hint="When a show you track gets its final status"
						value={prefs.seriesEnded.on}
						onChange={(v) => edit((p) => void (p.seriesEnded.on = v))}
					/>
					<SwitchRow
						label="New season announced"
						hint="When a new season shows up for a show you track"
						value={prefs.newSeason.on}
						onChange={(v) => edit((p) => void (p.newSeason.on = v))}
					/>
					<SwitchRow
						label="Air date changed"
						hint="When an episode moves to another day or time"
						value={prefs.dateChanged.on}
						onChange={(v) => edit((p) => void (p.dateChanged.on = v))}
					/>
				</Section>

				{/* Movies */}
				<Section title="Movies">
					<SwitchRow
						first
						label="Movie releases"
						hint="The day a movie on your list comes out"
						value={prefs.movies.releaseOn}
						onChange={(v) => edit((p) => void (p.movies.releaseOn = v))}
					/>
					<SwitchRow
						label="Upcoming movie reminders"
						hint="A heads-up before a movie on your list is released"
						value={prefs.movies.remindOn}
						onChange={(v) => edit((p) => void (p.movies.remindOn = v))}
					/>
					{prefs.movies.remindOn ? (
						<>
							<Detail label="Remind me" hint="Days before release. Slide, or type any number">
								<NumberSlider
									label="Reminder days before release"
									value={remindFirst}
									limit={LIMITS.remindDays}
									unit="day"
									onChange={(v) => setReminders(v, remindSecond)}
								/>
							</Detail>
							<SwitchRow
								label="Second reminder"
								value={remindSecond !== null}
								onChange={(on) => setReminders(remindFirst, on ? (remindFirst === 1 ? 7 : 1) : null)}
							/>
							{remindSecond !== null ? (
								<Detail label="And again">
									<NumberSlider
										label="Second reminder days before release"
										value={remindSecond}
										limit={LIMITS.remindDays}
										unit="day"
										onChange={(v) => setReminders(remindFirst, v)}
									/>
								</Detail>
							) : null}
						</>
					) : null}
				</Section>

				{/* Summaries and reminders */}
				<Section title="Summaries & reminders">
					<SwitchRow
						first
						label="Weekly digest"
						hint="What is coming up in the days ahead"
						value={prefs.weeklyDigest.on}
						onChange={(v) => edit((p) => void (p.weeklyDigest.on = v))}
					/>
					{prefs.weeklyDigest.on ? (
						<>
							<Detail label="Day">
								<WeekdayChips value={prefs.weeklyDigest.weekday} onChange={(v) => edit((p) => void (p.weeklyDigest.weekday = v))} />
							</Detail>
							<Detail label="Time">
								<HourStepper label="Weekly digest time" value={prefs.weeklyDigest.hour} onChange={(v) => edit((p) => void (p.weeklyDigest.hour = v))} />
							</Detail>
							<Detail label="Covers the next">
								<NumberSlider
									label="Weekly digest covers days"
									value={prefs.weeklyDigest.windowDays}
									limit={LIMITS.windowDays}
									unit="day"
									onChange={(v) => edit((p) => void (p.weeklyDigest.windowDays = v))}
								/>
							</Detail>
						</>
					) : null}
					<SwitchRow
						label="Daily digest"
						hint="One morning alert listing what airs today"
						value={prefs.dailyDigest.on}
						onChange={(v) => edit((p) => void (p.dailyDigest.on = v))}
					/>
					{prefs.dailyDigest.on ? (
						<Detail label="Time">
							<HourStepper label="Daily digest time" value={prefs.dailyDigest.hour} onChange={(v) => edit((p) => void (p.dailyDigest.hour = v))} />
						</Detail>
					) : null}
					<SwitchRow
						label="Catch-up reminder"
						hint="A weekly count of episodes you haven't watched yet"
						value={prefs.backlog.on}
						onChange={(v) => edit((p) => void (p.backlog.on = v))}
					/>
					{prefs.backlog.on ? (
						<>
							<Detail label="Day">
								<WeekdayChips value={prefs.backlog.weekday} onChange={(v) => edit((p) => void (p.backlog.weekday = v))} />
							</Detail>
							<Detail label="Time">
								<HourStepper label="Catch-up time" value={prefs.backlog.hour} onChange={(v) => edit((p) => void (p.backlog.hour = v))} />
							</Detail>
						</>
					) : null}
					<SwitchRow
						label="Reopen reminder"
						hint="A nudge after a while without opening Watchloom"
						value={prefs.nudge.on}
						onChange={(v) => edit((p) => void (p.nudge.on = v))}
					/>
					{prefs.nudge.on ? (
						<Detail label="After">
							<NumberSlider
								label="Reopen reminder after days"
								value={prefs.nudge.days}
								limit={LIMITS.nudgeDays}
								unit="day"
								onChange={(v) => edit((p) => void (p.nudge.days = v))}
							/>
						</Detail>
					) : null}
				</Section>

				{/* Quiet hours */}
				<Section title="Quiet hours">
					<SwitchRow
						first
						label="Quiet hours"
						hint={prefs.quiet.on ? QUIET_MODE_HINTS[prefs.quiet.mode] : "Alerts arrive whenever they happen"}
						value={prefs.quiet.on}
						onChange={(v) => edit((p) => void (p.quiet.on = v))}
					/>
					{prefs.quiet.on ? (
						<>
							<Detail label="From">
								<HourStepper label="Quiet hours start" value={prefs.quiet.startHour} onChange={(v) => edit((p) => void (p.quiet.startHour = v))} />
							</Detail>
							<Detail label="Until">
								<HourStepper label="Quiet hours end" value={prefs.quiet.endHour} onChange={(v) => edit((p) => void (p.quiet.endHour = v))} />
							</Detail>
							<Detail label="Held alerts arrive at">
								<HourStepper label="Morning alert time" value={prefs.quiet.morningHour} onChange={(v) => edit((p) => void (p.quiet.morningHour = v))} />
							</Detail>
							<Detail label="On these days">
								<WeekdaysChips value={prefs.quiet.days} onChange={(v) => edit((p) => void (p.quiet.days = v))} />
							</Detail>
							<Detail label="During quiet hours">
								<Chips options={QUIET_MODE_OPTIONS} value={prefs.quiet.mode} onChange={(v) => edit((p) => void (p.quiet.mode = v))} />
							</Detail>
						</>
					) : null}
				</Section>

				{/* Timing and grouping */}
				<Section title="Timing & grouping">
					<Detail label="Alerts with only a date arrive at" hint="Episodes without an exact air time, movie releases and reminders">
						<HourStepper label="Default alert time" value={prefs.timing.defaultHour} onChange={(v) => edit((p) => void (p.timing.defaultHour = v))} />
					</Detail>
					<Detail label="Plan ahead" hint="How far in advance alerts are scheduled">
						<NumberSlider
							label="Plan ahead days"
							value={prefs.timing.horizonDays}
							limit={LIMITS.horizonDays}
							unit="day"
							onChange={(v) => edit((p) => void (p.timing.horizonDays = v))}
						/>
					</Detail>
					<Detail label="Most alerts per day" hint="Extras fold into one alert. 0 = no limit">
						<NumberSlider
							label="Most alerts per day"
							value={prefs.timing.maxPerDay}
							limit={LIMITS.maxPerDay}
							unit="alert"
							zero="No limit"
							onChange={(v) => edit((p) => void (p.timing.maxPerDay = v))}
						/>
					</Detail>
					<SwitchRow
						label="Group overnight alerts"
						hint="Several shows held by quiet hours arrive as one"
						value={prefs.grouping.overnight}
						onChange={(v) => edit((p) => void (p.grouping.overnight = v))}
					/>
					<SwitchRow
						label="Combine episodes of one show"
						hint="Off: every episode gets its own alert"
						value={prefs.grouping.combineEpisodes}
						onChange={(v) => edit((p) => void (p.grouping.combineEpisodes = v))}
					/>
					<Detail label="Rows in an expanded alert">
						<NumberSlider
							label="Rows in an expanded alert"
							value={prefs.grouping.maxRows}
							limit={LIMITS.maxRows}
							unit="row"
							onChange={(v) => edit((p) => void (p.grouping.maxRows = v))}
						/>
					</Detail>
				</Section>

				{/* Look and sound */}
				<Section title="Look & sound">
					<Detail label="Alert style" hint="Text only also saves a little data">
						<Chips options={PICTURE_OPTIONS} value={prefs.look.picture} onChange={(v) => edit((p) => void (p.look.picture = v))} />
					</Detail>
					<SwitchRow
						label="Spoiler-safe"
						hint="Episodes by number only: no title, no still from the episode"
						value={prefs.look.spoilerSafe}
						onChange={(v) => edit((p) => void (p.look.spoilerSafe = v))}
					/>
					<Detail label="How it appears">
						<Chips options={PRIORITY_OPTIONS} value={prefs.look.priority} onChange={(v) => edit((p) => void (p.look.priority = v))} />
					</Detail>
					<Detail label="On the lock screen">
						<Chips options={VISIBILITY_OPTIONS} value={prefs.look.visibility} onChange={(v) => edit((p) => void (p.look.visibility = v))} />
					</Detail>
					<SwitchRow label="Sound" value={prefs.look.sound} onChange={(v) => edit((p) => void (p.look.sound = v))} />
					<SwitchRow label="Vibration" value={prefs.look.vibrate} onChange={(v) => edit((p) => void (p.look.vibrate = v))} />
					<Row label="Send a test alert" onPress={openPicker}>
						<View style={styles.textWrap}>
							<Text style={styles.rowText}>Send a test alert</Text>
							<Text style={styles.rowHint}>{testMessage || "See how your alerts look and sound"}</Text>
						</View>
					</Row>
				</Section>

				{/* Titles */}
				<Section title="Titles">
					<Row first label="Muted and chosen titles" onPress={() => navigation.navigate(Route.NOTIFICATION_TITLES)}>
						<View style={styles.textWrap}>
							<Text style={styles.rowText}>Choose titles</Text>
							<Text style={styles.rowHint}>{titlesHint}</Text>
						</View>
						<Text style={styles.chevron}>›</Text>
					</Row>
				</Section>

				<Section>
					<Row first label="Reset notification settings" onPress={() => setResetOpen(true)}>
						<Text style={[styles.rowText, styles.rowTextDanger]}>Reset to defaults</Text>
					</Row>
				</Section>
				<Text style={styles.footer}>{NOTIFICATIONS_FOOTER}</Text>
			</ScrollView>

			<ConfirmModal
				visible={resetOpen}
				title="Reset notifications?"
				hint="Every setting here goes back to its default. Muted titles are cleared too."
				confirmLabel="Reset"
				onConfirm={reset}
				onClose={() => setResetOpen(false)}
			/>
			<OptionsSheet
				visible={picker !== null}
				title="Send a test alert"
				subtitle={
					picker?.realTitles
						? "Built from your shows and look settings"
						: "Sample names, no pictures yet"
				}
				options={(picker?.samples ?? []).map((s) => ({
					key: s.key,
					label: s.label,
					hint: s.hint,
					icon: SAMPLE_ICONS[s.key] ?? "notifications-outline",
					onPress: () => {
						sendSample(s);
					},
				}))}
				onClose={() => setPicker(null)}
			/>
		</SwipeBackView>
	);
}

const styles = themedStyles(() =>
	StyleSheet.create({
		container: { flex: 1, backgroundColor: colors.background },
		scrollContent: { paddingBottom: spacing.xl },
		headerRow: {
			flexDirection: "row",
			alignItems: "center",
			paddingHorizontal: spacing.sm,
			paddingVertical: spacing.sm,
		},
		headerSpacer: { width: CIRCLE_BUTTON_SIZE },
		headerTitle: { ...typography.title, flex: 1, textAlign: "center", fontSize: 18 },
		textWrap: { flex: 1 },
		rowText: { ...typography.subtitle, fontSize: 15, color: colors.text },
		rowTextDanger: { color: colors.destructiveRed },
		rowHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
		chevron: { ...typography.title, color: colors.textMuted },
		footer: {
			...typography.caption,
			color: colors.textMuted,
			textAlign: "center",
			marginHorizontal: spacing.lg,
			marginVertical: spacing.lg,
		},
	}),
);
