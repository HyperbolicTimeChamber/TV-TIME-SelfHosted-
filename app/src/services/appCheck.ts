import { getApp } from "@react-native-firebase/app";
import {
	initializeAppCheck,
	ReactNativeFirebaseAppCheckProvider,
} from "@react-native-firebase/app-check";

/**
 * App Check proves requests come from this app on a genuine device (Play Integrity on Android,
 * App Attest → DeviceCheck on iOS). RNFirebase then attaches the token to Firestore and
 * callable requests by itself. Dev builds use the debug provider: register the token they
 * log (or EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN) under App Check → Manage debug tokens.
 * Enforcement is switched on server-side (console + ENFORCE_CALLABLE_APP_CHECK) only once
 * this build is what people run.
 */
export function initAppCheck() {
	try {
		start();
	} catch (err) {
		// A binary built before App Check was added has no native module — run without it
		console.warn("[appCheck] unavailable:", err);
	}
}

function start() {
	const provider = new ReactNativeFirebaseAppCheckProvider();
	const debugToken = process.env.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN;
	provider.configure({
		android: { provider: __DEV__ ? "debug" : "playIntegrity", debugToken },
		apple: { provider: __DEV__ ? "debug" : "appAttestWithDeviceCheckFallback", debugToken },
	});
	initializeAppCheck(getApp(), { provider, isTokenAutoRefreshEnabled: true }).catch(() => {});
}
