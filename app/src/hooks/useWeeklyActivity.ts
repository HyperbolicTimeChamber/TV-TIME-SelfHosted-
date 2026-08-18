import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CacheKey } from "../types";

export interface DayActivity {
	episodes: number;
	movies: number;
}

export type WeeklyData = Record<string, DayActivity>;

function todayStr() {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getLast7Days(): string[] {
	const days: string[] = [];
	const now = new Date();
	for (let i = 6; i >= 0; i--) {
		const d = new Date(now);
		d.setDate(d.getDate() - i);
		days.push(
			`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
		);
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

async function loadWeeklyData(): Promise<WeeklyData> {
	const raw = await AsyncStorage.getItem(CacheKey.WEEKLY_ACTIVITY);
	if (!raw) return {};
	try {
		return pruneToWeek(JSON.parse(raw));
	} catch {
		return {};
	}
}

async function saveWeeklyData(data: WeeklyData): Promise<void> {
	await AsyncStorage.setItem(CacheKey.WEEKLY_ACTIVITY, JSON.stringify(data)).catch(() => {});
}

/** Call after successful mark watched to bump today's count. */
export async function incrementDailyWatch(type: "episode" | "movie"): Promise<void> {
	const data = await loadWeeklyData();
	const today = todayStr();
	const day = data[today] ?? { episodes: 0, movies: 0 };
	if (type === "episode") day.episodes++;
	else day.movies++;
	data[today] = day;
	await saveWeeklyData(data);
}

/** Call after unwatch to reduce today's count. */
export async function decrementDailyWatch(type: "episode" | "movie"): Promise<void> {
	const data = await loadWeeklyData();
	const today = todayStr();
	const day = data[today];
	if (!day) return;
	if (type === "episode") day.episodes = Math.max(0, day.episodes - 1);
	else day.movies = Math.max(0, day.movies - 1);
	data[today] = day;
	await saveWeeklyData(data);
}

export function useWeeklyActivity() {
	const [weeklyData, setWeeklyData] = useState<WeeklyData>({});
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		loadWeeklyData().then((data) => {
			setWeeklyData(data);
			saveWeeklyData(data);
			setLoading(false);
		});
	}, []);

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
