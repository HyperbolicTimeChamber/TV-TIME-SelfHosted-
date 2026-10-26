import { useEffect, useState, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	getFirestore,
	collection,
	doc,
	query,
	where,
	getDocs,
	Timestamp,
} from "@react-native-firebase/firestore";
import { CacheKey } from "../types";
import { tallyWeek } from "../utils/weeklyTally";

export interface DayActivity {
	episodes: number;
	movies: number;
}

export type WeeklyData = Record<string, DayActivity>;

/**
 * The tally, plus enough to tell whether anything was watched that this device didn't do.
 * Each local mark moves the account's lifetime count by one, so `syncedTotal` plus the ops
 * since should still bracket it. Anything outside came from somewhere else — another device,
 * an import, a cloud function — and only that is worth a query.
 */
interface WeeklyCache {
	/** CACHE_VERSION it was written under; older tallies are thrown away and rebuilt */
	version?: number;
	days: WeeklyData;
	/** users/{uid}.stats episodes + movies at the last reconcile */
	syncedTotal?: number;
	/** Local marks / unmarks since then */
	incOps?: number;
	decOps?: number;
	/** Backstop, in case the bracket ever misses something */
	seededOn?: string;
}

/**
 * Bumped when the tally's rules change, so days counted under the old rules don't linger
 * (mergeDays keeps whichever count is higher). v2: bulk marks no longer count.
 */
const CACHE_VERSION = 2;

const dayKey = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function todayStr() {
	return dayKey(new Date());
}

function getLast7Days(): string[] {
	const days: string[] = [];
	const now = new Date();
	for (let i = 6; i >= 0; i--) {
		const d = new Date(now);
		d.setDate(d.getDate() - i);
		days.push(dayKey(d));
	}
	return days;
}

function pruneToWeek(data: WeeklyData): WeeklyData {
	const validDays = new Set(getLast7Days());
	const pruned: WeeklyData = {};
	for (const day of validDays) {
		if (data[day]) pruned[day] = data[day];
	}
	return pruned;
}

/** Server counts win, except where the local tally is ahead — a mark made moments ago may not
 *  be in the query's results yet */
function mergeDays(seeded: WeeklyData, local: WeeklyData): WeeklyData {
	const merged: WeeklyData = { ...seeded };
	for (const [day, counts] of Object.entries(local)) {
		const from = merged[day] ?? { episodes: 0, movies: 0 };
		merged[day] = {
			episodes: Math.max(from.episodes, counts.episodes),
			movies: Math.max(from.movies, counts.movies),
		};
	}
	return merged;
}

async function loadCache(): Promise<WeeklyCache> {
	const raw = await AsyncStorage.getItem(CacheKey.WEEKLY_ACTIVITY);
	if (!raw) return { days: {} };
	try {
		const parsed = JSON.parse(raw);
		// Counted under older rules (or the old top-level day map): start over. No syncedTotal
		// either, so the next load rebuilds the week from the watched collections
		if (!parsed || typeof parsed !== "object" || parsed.version !== CACHE_VERSION) {
			return { days: {} };
		}
		return { ...parsed, days: pruneToWeek(parsed.days ?? {}) };
	} catch {
		return { days: {} };
	}
}

async function saveCache(cache: WeeklyCache): Promise<void> {
	await AsyncStorage.setItem(
		CacheKey.WEEKLY_ACTIVITY,
		JSON.stringify({ ...cache, version: CACHE_VERSION }),
	).catch(() => {});
}

async function loadWeeklyData(): Promise<WeeklyData> {
	return (await loadCache()).days;
}

/** Call after successful mark watched to bump today's count. */
export async function incrementDailyWatch(type: "episode" | "movie"): Promise<void> {
	const cache = await loadCache();
	const today = todayStr();
	const day = cache.days[today] ?? { episodes: 0, movies: 0 };
	if (type === "episode") day.episodes++;
	else day.movies++;
	cache.days[today] = day;
	cache.incOps = (cache.incOps ?? 0) + 1;
	await saveCache(cache);
}

/** Call after unwatch to reduce today's count. */
export async function decrementDailyWatch(type: "episode" | "movie"): Promise<void> {
	const cache = await loadCache();
	const today = todayStr();
	const day = cache.days[today];
	if (!day) return;
	if (type === "episode") day.episodes = Math.max(0, day.episodes - 1);
	else day.movies = Math.max(0, day.movies - 1);
	cache.days[today] = day;
	cache.decOps = (cache.decOps ?? 0) + 1;
	await saveCache(cache);
}

/** Firestore Timestamp (or a restored plain object) → local day key */
function dayOf(stamp: any): string | null {
	const date =
		typeof stamp?.toDate === "function"
			? stamp.toDate()
			: typeof stamp?.seconds === "number"
				? new Date(stamp.seconds * 1000)
				: null;
	return date ? dayKey(date) : null;
}

/**
 * Rebuild the week from the watched collections. The tally is otherwise only ever written by
 * `incrementDailyWatch` on this device, so a fresh install, a new device or a cleared cache
 * showed an empty chart however much had been watched.
 */
async function seedFromWatched(userId: string): Promise<WeeklyData> {
	const start = new Date();
	start.setDate(start.getDate() - 6);
	start.setHours(0, 0, 0, 0);
	const since = Timestamp.fromDate(start);
	const userRef = doc(getFirestore(), "users", userId);

	const read = async (name: string) => {
		const snap = await getDocs(
			query(collection(userRef, name), where("lastWatchedAt", ">=", since)),
		);
		return snap.docs.map((d) => d.data() as { lastWatchedAt?: unknown });
	};
	const [episodes, movies] = await Promise.all([read("watchedEpisodes"), read("watchedMovies")]);

	return pruneToWeek(tallyWeek(episodes, movies, dayOf));
}

/** Days after which the week is rebuilt regardless */
const MAX_STALE_DAYS = 7;

const daysBetween = (from: string, to: string) =>
	Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/**
 * @param userId        owner of the tally
 * @param watchedTotal  `stats.episodesWatched + stats.moviesWatched`, or null while they load.
 *                      Already on a live snapshot in useUserStats, so reading it costs nothing.
 */
export function useWeeklyActivity(userId?: string, watchedTotal?: number | null) {
	const [weeklyData, setWeeklyData] = useState<WeeklyData>({});
	const [loading, setLoading] = useState(true);
	// One seed attempt per mount, whatever re-renders do
	const seeding = useRef(false);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const cache = await loadCache();
			if (cancelled) return;
			setWeeklyData(cache.days);
			setLoading(false);

			if (!userId || watchedTotal == null || seeding.current) return;

			const today = todayStr();
			const stale = !cache.seededOn || daysBetween(cache.seededOn, today) >= MAX_STALE_DAYS;
			// Our own activity keeps the lifetime count inside this bracket
			const low = (cache.syncedTotal ?? 0) - (cache.decOps ?? 0);
			const high = (cache.syncedTotal ?? 0) + (cache.incOps ?? 0);
			const untracked =
				cache.syncedTotal === undefined || watchedTotal < low || watchedTotal > high;

			if (!untracked && !stale) {
				// Nothing happened elsewhere: keep the local tally, just bank the reconcile
				await saveCache({ ...cache, syncedTotal: watchedTotal, incOps: 0, decOps: 0 });
				return;
			}

			seeding.current = true;
			try {
				const seeded = await seedFromWatched(userId);
				if (cancelled) return;
				const latest = await loadCache();
				const days = mergeDays(seeded, latest.days);
				setWeeklyData(days);
				await saveCache({ days, syncedTotal: watchedTotal, incOps: 0, decOps: 0, seededOn: today });
			} catch {
				await saveCache({ ...cache, seededOn: today });
			} finally {
				seeding.current = false;
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [userId, watchedTotal]);

	const refresh = useCallback(() => {
		loadWeeklyData().then(setWeeklyData);
	}, []);

	const days = getLast7Days();
	const chartData = days.map((day) => ({
		day,
		label: new Date(day + "T12:00:00").toLocaleDateString("en", { weekday: "short" }).slice(0, 3),
		episodes: weeklyData[day]?.episodes ?? 0,
		movies: weeklyData[day]?.movies ?? 0,
	}));

	return { chartData, loading, refresh };
}
