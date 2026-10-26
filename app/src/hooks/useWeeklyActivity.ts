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

export interface DayActivity {
	episodes: number;
	movies: number;
}

export type WeeklyData = Record<string, DayActivity>;

/** Tally plus the day it was last seeded, so an genuinely empty week isn't re-queried */
interface WeeklyCache {
	days: WeeklyData;
	seededOn?: string;
}

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
		// Older builds stored the day map at the top level
		if (parsed && typeof parsed === "object" && "days" in parsed) {
			return { days: pruneToWeek(parsed.days ?? {}), seededOn: parsed.seededOn };
		}
		return { days: pruneToWeek(parsed ?? {}) };
	} catch {
		return { days: {} };
	}
}

async function saveCache(cache: WeeklyCache): Promise<void> {
	await AsyncStorage.setItem(CacheKey.WEEKLY_ACTIVITY, JSON.stringify(cache)).catch(() => {});
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

	const days: WeeklyData = {};
	const bump = (stamp: unknown, key: keyof DayActivity) => {
		const day = dayOf(stamp);
		if (!day) return;
		const entry = days[day] ?? { episodes: 0, movies: 0 };
		entry[key]++;
		days[day] = entry;
	};
	for (const e of episodes) bump(e.lastWatchedAt, "episodes");
	for (const m of movies) bump(m.lastWatchedAt, "movies");
	return pruneToWeek(days);
}

export function useWeeklyActivity(userId?: string) {
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

			// Once a day, whatever the tally holds. Gating this on an empty tally meant a device
			// that had marked anything today never backfilled the days before it — the chart
			// showed one bar.
			const today = todayStr();
			if (!userId || cache.seededOn === today || seeding.current) {
				await saveCache(cache);
				return;
			}
			seeding.current = true;
			try {
				const seeded = await seedFromWatched(userId);
				if (cancelled) return;
				const latest = await loadCache();
				const days = mergeDays(seeded, latest.days);
				setWeeklyData(days);
				await saveCache({ days, seededOn: today });
			} catch {
				await saveCache({ ...cache, seededOn: today });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [userId]);

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
