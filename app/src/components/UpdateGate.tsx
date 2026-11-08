import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import UpdateSheet from "./modals/UpdateSheet";
import UpdateNotification from "../../modules/update-notification";
import { INSTALLED_BUILD, UPDATES_SUPPORTED, subscribeRelease } from "../services/appUpdate";
import { trackAppUpdated, trackUpdateDrawerShown } from "../services/mixpanel";
import {
	isForced,
	offeredRelease,
	shouldOffer,
	updateEventProps,
	useUpdateStore,
} from "../stores/updateStore";
import { APP_VERSION } from "../utils/appVersion";

/** Starts the release listener once (config/release, one doc) and loads "Not now" / simulation */
export function useReleaseWatch(): void {
	const started = useRef(false);
	useEffect(() => {
		if (!UPDATES_SUPPORTED || started.current) return;
		started.current = true;
		trackAppUpdated(INSTALLED_BUILD, APP_VERSION);
		// The APK of an update that's now installed: deleted (one not installed yet is kept)
		UpdateNotification?.cleanupInstalledApk();
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
	const visible = shouldOffer(state);
	// Once per build per run: it can re-open (a forced drawer on returning to the app)
	const trackedBuild = useRef(0);
	useEffect(() => {
		const props = updateEventProps(useUpdateStore.getState());
		if (!visible || !props || trackedBuild.current === props.to_build) return;
		trackedBuild.current = props.to_build;
		trackUpdateDrawerShown(props);
	}, [visible, release?.build]);
	// Coming back to the app re-shows a forced drawer that a back press hid
	useEffect(() => {
		const sub = AppState.addEventListener("change", (next) => {
			if (next === "active") useUpdateStore.setState({ dismissed: false });
		});
		return () => sub.remove();
	}, []);
	if (!release) return null;
	return <UpdateSheet visible={visible} release={release} forced={forced} />;
}
