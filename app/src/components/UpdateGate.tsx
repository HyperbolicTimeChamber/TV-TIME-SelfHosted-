import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import UpdateSheet from "./modals/UpdateSheet";
import { UPDATES_SUPPORTED, subscribeRelease } from "../services/appUpdate";
import { isForced, offeredRelease, shouldOffer, useUpdateStore } from "../stores/updateStore";

/** Starts the release listener once (config/release, one doc) and loads "Not now" / simulation */
export function useReleaseWatch(): void {
	const started = useRef(false);
	useEffect(() => {
		if (!UPDATES_SUPPORTED || started.current) return;
		started.current = true;
		useUpdateStore.getState().loadLocal();
		const unsubscribe = subscribeRelease((release) => useUpdateStore.getState().setRelease(release));
		return unsubscribe;
	}, []);
}

/** This build is below its channel's minimum (the app behind the drawer takes no touches) */
export function useUpdateForced(): boolean {
	return useUpdateStore((s) => isForced(s));
}

/**
 * The update drawer over whatever is showing (login or the app). Forced: it can't be put off and
 * the app behind it takes no touches (App.tsx)
 */
export default function UpdatePrompt() {
	const state = useUpdateStore();
	const release = offeredRelease(state);
	const forced = isForced(state);
	// Coming back to the app re-shows a forced drawer that a back press hid
	useEffect(() => {
		const sub = AppState.addEventListener("change", (next) => {
			if (next === "active") useUpdateStore.setState({ dismissed: false });
		});
		return () => sub.remove();
	}, []);
	if (!release) return null;
	return <UpdateSheet visible={shouldOffer(state)} release={release} forced={forced} />;
}
