import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * Opens a streaming service's link in its Android app (see android/.../ServiceAppsModule.kt).
 * Missing (web, an older build) → null: the caller opens the link as before
 */
interface ServiceAppsModule {
	/** true when an app took it (the link, or the app's home screen); false → open it in the browser */
	openInApp(url: string, packageName: string | null): boolean;
}

export default requireOptionalNativeModule<ServiceAppsModule>("ServiceApps");
