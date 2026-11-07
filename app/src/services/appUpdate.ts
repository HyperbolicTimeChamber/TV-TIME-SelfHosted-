import { BackHandler, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { doc, getFirestore, onSnapshot } from "@react-native-firebase/firestore";
import {
	RELEASE_CONFIG_DOC,
	UPDATE_APK_FILE,
	UPDATE_CHANNEL,
	UPDATE_PROGRESS_INTERVAL_MS,
} from "../enums";
import { APP_BUILD } from "../utils/appVersion";

/** One channel's entry in config/release (CI's publish-release script writes it) */
export interface ChannelRelease {
	/** Version name ("1.2.0") */
	version: string;
	/** versionCode of the APK */
	build: number;
	/** GitHub release asset (public) */
	apkUrl: string;
	/** Bytes — the download's progress total when the server sends no length */
	size?: number;
	/** Release notes (the commit message) */
	notes?: string;
	/** Builds below this are blocked (force update) */
	minBuild?: number;
}

/** This build's versionCode (0 when unknown — never prompted then) */
export const INSTALLED_BUILD = APP_BUILD;

/** In-app updates install APKs: Android only, and only builds made for a channel (or dev) */
export const UPDATES_SUPPORTED = Platform.OS === "android" && UPDATE_CHANNEL != null;

/** Live config/release entry for this build's channel (null: none / unsupported) */
export function subscribeRelease(onChange: (release: ChannelRelease | null) => void): () => void {
	if (!UPDATES_SUPPORTED || !UPDATE_CHANNEL) return () => {};
	const channel = UPDATE_CHANNEL;
	return onSnapshot(
		doc(getFirestore(), ...RELEASE_CONFIG_DOC),
		(snap) => {
			const entry = snap.exists() ? (snap.data()?.[channel] as ChannelRelease | undefined) : undefined;
			onChange(entry && entry.build > 0 && entry.apkUrl ? entry : null);
		},
		// Offline / rules: no prompt rather than a wrong one
		() => onChange(null),
	);
}

/** Where a download lands (app cache: no storage permission, Android may clear it) */
const apkPath = () => `${FileSystem.cacheDirectory}${UPDATE_APK_FILE}`;

export interface DownloadHandle {
	/** Resolves with the APK's file:// uri; rejects when it fails or is cancelled */
	done: Promise<string>;
	cancel: () => void;
}

/**
 * Downloads a release's APK to the cache, reporting progress 0..1 (coalesced to
 * UPDATE_PROGRESS_INTERVAL_MS, plus the final 1). No checksum: Android only installs it over this
 * app when it's signed with the same key, which a tampered file can't be
 */
export function downloadApk(
	release: ChannelRelease,
	onProgress: (fraction: number) => void,
): DownloadHandle {
	let lastEmit = 0;
	let cancelled = false;
	const task = FileSystem.createDownloadResumable(release.apkUrl, apkPath(), {}, (p) => {
		const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : (release.size ?? 0);
		if (total <= 0) return;
		const now = Date.now();
		if (now - lastEmit < UPDATE_PROGRESS_INTERVAL_MS) return;
		lastEmit = now;
		onProgress(Math.min(p.totalBytesWritten / total, 0.99));
	});
	const done = (async () => {
		const result = await task.downloadAsync();
		if (cancelled || !result) throw new Error("cancelled");
		if (result.status !== 200) throw new Error(`HTTP ${result.status}`);
		onProgress(1);
		return result.uri;
	})();
	return {
		done,
		cancel: () => {
			cancelled = true;
			task.cancelAsync().catch(() => {});
		},
	};
}

/** The APK a previous download left, if it's still there (a notification's "Tap to install") */
export async function downloadedApk(): Promise<string | null> {
	const info = await FileSystem.getInfoAsync(apkPath()).catch(() => null);
	return info?.exists ? info.uri : null;
}

/** FLAG_GRANT_READ_URI_PERMISSION: the installer may read our content:// uri */
const GRANT_READ_URI = 1;

/**
 * Hands the APK to Android's installer. The first time, Android asks to allow installs from this
 * app (its own screen, with a Settings shortcut); after the install the installer offers "Open"
 */
export async function installApk(fileUri: string): Promise<void> {
	const contentUri = await FileSystem.getContentUriAsync(fileUri);
	await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
		data: contentUri,
		type: "application/vnd.android.package-archive",
		flags: GRANT_READ_URI,
	});
}

/** Force update dismissed (back / cancel): the app may not be used, so it closes */
export function exitApp(): void {
	BackHandler.exitApp();
}
