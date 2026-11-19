import { AIRING_MESSAGE, AlertType, MediaType } from "../enums";
import type { AiringOverride } from "./airingPlan";

/** FCM data values arrive as strings (objects are possible in the typings) */
type PushData = Record<string, string | object> | undefined;

/** notifyAirings' push → the corrections it carries; null when it isn't an airing push */
export function parseAiringPush(data: PushData): { docId: string; overrides: AiringOverride[] } | null {
	if (!data || data.type !== AIRING_MESSAGE || typeof data.docId !== "string" || !data.docId) return null;
	const docId = data.docId;
	let items: unknown;
	try {
		items = JSON.parse(String(data.items ?? "[]"));
	} catch {
		return { docId, overrides: [] };
	}
	const overrides: AiringOverride[] = [];
	if (Array.isArray(items)) {
		for (const item of items as Record<string, unknown>[]) {
			const season = Number(item?.season);
			const episode = Number(item?.episode);
			const stamp = typeof item?.airStamp === "string" ? item.airStamp : "";
			// Date-only episodes carry no time to correct; the cached catalog's 9 am stands
			if (!Number.isInteger(season) || !Number.isInteger(episode) || Number.isNaN(Date.parse(stamp))) continue;
			overrides.push({ docId, season, episode, name: typeof item.name === "string" ? item.name : "", airStamp: stamp });
		}
	}
	return { docId, overrides };
}

/** A tapped alert's notification data → where it goes: the title's page, else the Upcoming tab */
export function alertTarget(
	data: Record<string, unknown> | undefined,
): { alert: AlertType; show: { tmdbId: number; mediaType: MediaType } | null } | null {
	const alert = Object.values(AlertType).find((a) => a === data?.alert);
	if (!alert) return null;
	const tmdbId = Number(data?.tmdbId);
	const mediaType = Object.values(MediaType).find((m) => m === data?.mediaType);
	const show = Number.isInteger(tmdbId) && tmdbId > 0 && mediaType ? { tmdbId, mediaType } : null;
	return { alert, show };
}
