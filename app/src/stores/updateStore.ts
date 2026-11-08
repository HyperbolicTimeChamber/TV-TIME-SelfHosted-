import { AppState } from "react-native";
import { create } from "zustand";
import UpdateNotification from "../../modules/update-notification";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CacheKey } from "../enums";
import {
	INSTALLED_BUILD,
	downloadApk,
	installApk,
	type ChannelRelease,
	type DownloadHandle,
} from "../services/appUpdate";

/** Where an in-app update stands */
export enum UpdatePhase {
	IDLE = "idle",
	DOWNLOADING = "downloading",
	/** Downloaded; the installer was opened (or can be reopened) */
	READY = "ready",
	FAILED = "failed",
}

/** Debug test flow: pretend the channel has a newer build (optionally a forced one) */
export interface UpdateSimulation {
	force: boolean;
}

interface UpdateState {
	/** config/release entry for this build's channel */
	release: ChannelRelease | null;
	simulation: UpdateSimulation | null;
	/** "Not now" was tapped on this build */
	skippedBuild: number | null;
	/** Sheet dismissed for this session (it comes back on the next launch) */
	dismissed: boolean;
	phase: UpdatePhase;
	/** 0..1 while downloading */
	progress: number;
	apkUri: string | null;
	setRelease: (release: ChannelRelease | null) => void;
	loadLocal: () => Promise<void>;
	skip: () => void;
	startDownload: () => void;
	cancelDownload: () => void;
	install: () => void;
	simulate: (simulation: UpdateSimulation | null) => void;
	/** Debug: forget "Not now" */
	clearSkip: () => void;
}

let handle: DownloadHandle | null = null;

/** The release the app offers: the real one, or a simulated newer copy of it (debug) */
export function offeredRelease(s: Pick<UpdateState, "release" | "simulation">): ChannelRelease | null {
	if (!s.release) return null;
	if (!s.simulation) return s.release;
	return {
		...s.release,
		build: Math.max(s.release.build, INSTALLED_BUILD + 1),
		minBuild: s.simulation.force ? INSTALLED_BUILD + 1 : s.release.minBuild,
	};
}

/** This build is below the channel's minimum: the app may not be used */
export function isForced(s: Pick<UpdateState, "release" | "simulation">): boolean {
	const r = offeredRelease(s);
	return !!r?.minBuild && INSTALLED_BUILD > 0 && INSTALLED_BUILD < r.minBuild;
}

/** A newer build is out and wasn't put off ("Not now") — or it's forced */
export function shouldOffer(s: UpdateState): boolean {
	if (isForced(s)) return true;
	const r = offeredRelease(s);
	if (!r || INSTALLED_BUILD <= 0 || r.build <= INSTALLED_BUILD) return false;
	return !s.dismissed && s.skippedBuild !== r.build;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
	release: null,
	simulation: null,
	skippedBuild: null,
	dismissed: false,
	phase: UpdatePhase.IDLE,
	progress: 0,
	apkUri: null,

	setRelease: (release) => set({ release }),

	loadLocal: async () => {
		const [skipped, simulation] = await Promise.all([
			AsyncStorage.getItem(CacheKey.UPDATE_SKIPPED_BUILD).catch(() => null),
			AsyncStorage.getItem(CacheKey.UPDATE_SIMULATION).catch(() => null),
		]);
		set({
			skippedBuild: skipped ? Number(skipped) : null,
			simulation: simulation ? (JSON.parse(simulation) as UpdateSimulation) : null,
		});
	},

	skip: () => {
		const build = offeredRelease(get())?.build;
		set({ dismissed: true, skippedBuild: build ?? null });
		if (build) AsyncStorage.setItem(CacheKey.UPDATE_SKIPPED_BUILD, String(build)).catch(() => {});
	},

	startDownload: () => {
		const release = offeredRelease(get());
		if (!release || get().phase === UpdatePhase.DOWNLOADING) return;
		set({ phase: UpdatePhase.DOWNLOADING, progress: 0, apkUri: null });
		// Android build with the native module: its foreground service downloads (its card replaces
		// the "available" notification and keeps going if the app is closed or swiped away); the
		// drawer follows it through onDownload events (listenToNativeDownload)
		if (UpdateNotification) {
			UpdateNotification.startDownload(release.version, release.notes ?? "", release.apkUrl, release.size ?? 0);
			return;
		}
		handle = downloadApk(release, (progress) => set({ progress }));
		handle.done
			.then((apkUri) => {
				set({ phase: UpdatePhase.READY, progress: 1, apkUri });
				return installApk(apkUri);
			})
			.catch((err: Error) => {
				// Cancelled: back to the offer; anything else: a retry button
				set({ phase: err.message === "cancelled" ? UpdatePhase.IDLE : UpdatePhase.FAILED, progress: 0 });
			})
			.finally(() => {
				handle = null;
			});
	},

	cancelDownload: () => {
		if (UpdateNotification) UpdateNotification.cancelDownload();
		handle?.cancel();
		set({ phase: UpdatePhase.IDLE, progress: 0 });
	},

	install: () => {
		const { apkUri } = get();
		if (apkUri) installApk(apkUri).catch(() => set({ phase: UpdatePhase.FAILED }));
	},

	simulate: (simulation) => {
		set({ simulation, dismissed: false });
		if (simulation) AsyncStorage.setItem(CacheKey.UPDATE_SIMULATION, JSON.stringify(simulation)).catch(() => {});
		else AsyncStorage.removeItem(CacheKey.UPDATE_SIMULATION).catch(() => {});
	},

	clearSkip: () => {
		set({ skippedBuild: null, dismissed: false });
		AsyncStorage.removeItem(CacheKey.UPDATE_SKIPPED_BUILD).catch(() => {});
	},
}));

/** The native download's progress → the drawer; done → Android's installer when the app is open */
UpdateNotification?.addListener("onDownload", (event) => {
	const store = useUpdateStore;
	switch (event.type) {
		case "progress":
			store.setState({ phase: UpdatePhase.DOWNLOADING, progress: event.fraction });
			break;
		case "done":
			store.setState({ phase: UpdatePhase.READY, progress: 1, apkUri: event.uri });
			if (AppState.currentState === "active") store.getState().install();
			break;
		case "failed":
			store.setState({ phase: UpdatePhase.FAILED, progress: 0 });
			break;
		case "cancelled":
			store.setState({ phase: UpdatePhase.IDLE, progress: 0 });
			break;
	}
});
