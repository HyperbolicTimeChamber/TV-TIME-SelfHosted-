import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";

/** The background download's events (the drawer follows its progress) */
export type DownloadEvent =
	| { type: "progress"; fraction: number }
	| { type: "done"; uri: string }
	| { type: "failed" }
	| { type: "cancelled" };

/**
 * The app's own update notifications (Android, custom layouts in the app's theme — see
 * android/.../UpdateNotifications.kt). Missing (web, an older build) → null: no notification
 */
interface UpdateNotificationModule {
	/** "V x is available" + notes, a red Install that downloads in the background (progress card) */
	showOffer(version: string, notes: string, apkUrl: string, size: number): void;
	cancel(): void;
	/** The drawer's Update: the same foreground-service download (survives the app closing) */
	startDownload(version: string, notes: string, apkUrl: string, size: number): void;
	cancelDownload(): void;
	/** Deletes the downloaded APK once this build is the one it held (or newer) */
	cleanupInstalledApk(): void;
	/** A release with this versionCode is out: deletes a downloaded APK (and its card) of an older build */
	discardStaleDownload(offeredBuild: number): void;
	addListener(event: "onDownload", listener: (event: DownloadEvent) => void): EventSubscription;
}

export default requireOptionalNativeModule<UpdateNotificationModule>("UpdateNotification");
