import AsyncStorage from "@react-native-async-storage/async-storage";
import { getMessaging, subscribeToTopic, unsubscribeFromTopic } from "@react-native-firebase/messaging";
import { CacheKey, TITLE_TOPIC_BATCH, TITLE_TOPIC_MAX, TITLE_TOPIC_PREFIX } from "../enums";
import { chunk } from "../utils/trackingSync";

function parseIds(raw: string | null): string[] {
	try {
		const ids = JSON.parse(raw ?? "[]");
		return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
	} catch {
		return [];
	}
}

/**
 * Follows `title-{docId}` for exactly these titles (the day-ahead correction pushes): joins the new ones,
 * leaves the dropped ones, a few at a time. The followed set is saved, so a launch with nothing changed
 * makes no calls. Empty list = follow nothing (all alert switches off / signed out)
 */
export async function syncTitleTopics(docIds: string[]): Promise<void> {
	const wanted = new Set(docIds.slice(0, TITLE_TOPIC_MAX));
	const saved = parseIds(await AsyncStorage.getItem(CacheKey.TITLE_TOPICS).catch(() => null));
	const followed = new Set(saved);
	const join = [...wanted].filter((id) => !followed.has(id));
	const leave = saved.filter((id) => !wanted.has(id));
	if (join.length === 0 && leave.length === 0) return;
	const messaging = getMessaging();
	const jobs: (() => Promise<void>)[] = [
		...leave.map((id) => async () => {
			await unsubscribeFromTopic(messaging, TITLE_TOPIC_PREFIX + id).then(() => followed.delete(id), () => {});
		}),
		...join.map((id) => async () => {
			await subscribeToTopic(messaging, TITLE_TOPIC_PREFIX + id).then(() => followed.add(id), () => {});
		}),
	];
	for (const batch of chunk(jobs, TITLE_TOPIC_BATCH)) await Promise.all(batch.map((job) => job()));
	await AsyncStorage.setItem(CacheKey.TITLE_TOPICS, JSON.stringify([...followed]));
}
