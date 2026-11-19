import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { AIRING_LAUNCH_DELAY_MS, AIRING_REPLAN_DEBOUNCE_MS, ReplanSource } from "../enums";
import { clearAiring, replanAiring } from "../services/airingScheduler";
import { trackNotificationScheduled } from "../services/mixpanel";
import { onAiringReplanRequest } from "../utils/airingReplanSignal";
import { subscribeTracking, type TrackingDoc } from "./trackingStore";

/** What a re-plan depends on in a tracking doc (a change anywhere else doesn't re-plan) */
const fingerprint = (docs: TrackingDoc[]) =>
	docs
		.map(
			(d) =>
				`${d.id}:${d.status}:${d.nextEpisode?.season ?? ""}x${d.nextEpisode?.episode ?? ""}:${d.nextEpisodeAirDate ?? ""}:${d.releaseDate ?? ""}`,
		)
		.join("|");

/**
 * Keeps the on-device alerts planned while signed in: a few seconds after launch, after tracking
 * changes (mark, add, remove, pause), after the catalog cache or a switch changes, and on return
 * to the app. Signed out → everything cancelled. Android only
 */
export function useAiringReplan(uid: string | null) {
	useEffect(() => {
		if (Platform.OS !== "android") return;
		if (!uid) {
			clearAiring().catch(() => {});
			return;
		}
		let timer: ReturnType<typeof setTimeout> | null = null;
		let last = "";
		const schedule = (delay: number) => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = null;
				replanAiring(ReplanSource.FOREGROUND)
					.then((r) => {
						if (r.scheduled > 0 || r.cancelled > 0) trackNotificationScheduled({ count: r.planned, ...r });
					})
					.catch(() => {});
			}, delay);
		};
		schedule(AIRING_LAUNCH_DELAY_MS);
		const unsubscribeTracking = subscribeTracking(uid, (state) => {
			if (state.loading) return;
			const next = fingerprint(state.docs);
			if (next === last) return;
			last = next;
			schedule(AIRING_REPLAN_DEBOUNCE_MS);
		});
		const offSignal = onAiringReplanRequest(() => schedule(AIRING_REPLAN_DEBOUNCE_MS));
		const appState = AppState.addEventListener("change", (s) => {
			if (s === "active") schedule(AIRING_REPLAN_DEBOUNCE_MS);
		});
		return () => {
			if (timer) clearTimeout(timer);
			unsubscribeTracking();
			offSignal();
			appState.remove();
		};
	}, [uid]);
}
