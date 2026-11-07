import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * The app's own update notifications (Android, custom layouts in the app's theme — see
 * android/.../UpdateNotifications.kt). Missing (web, an older build) → null: no notification
 */
interface UpdateNotificationModule {
	/** "V x is available" + notes, a red Install that downloads in the background (progress card) */
	showOffer(version: string, notes: string, apkUrl: string, size: number): void;
	cancel(): void;
}

export default requireOptionalNativeModule<UpdateNotificationModule>("UpdateNotification");
