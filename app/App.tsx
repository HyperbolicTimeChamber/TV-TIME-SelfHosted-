import React, { useEffect, useRef } from "react";
import {
	View,
	StyleSheet,
	Platform,
	PermissionsAndroid,
	Alert,
	AppState,
	Linking,
} from "react-native";
import { Image } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import {
	useFonts,
	SmoochSans_400Regular,
	SmoochSans_500Medium,
} from "@expo-google-fonts/smooch-sans";
import { Handjet_800ExtraBold } from "@expo-google-fonts/handjet";
import { VT323_400Regular } from "@expo-google-fonts/vt323";
import crashlytics from "@react-native-firebase/crashlytics";
import { initAppCheck } from "./src/services/appCheck";
import { connectEmulators } from "./src/services/emulators";

// Before any Firestore / callable request, so they all carry an App Check token
initAppCheck();
// Dev opt-in: local Emulator Suite instead of production (EXPO_PUBLIC_USE_EMULATORS)
connectEmulators();

// Explicit: native crashes (sent on the next launch) and JS errors always report
crashlytics()
	.setCrashlyticsCollectionEnabled(true)
	.catch(() => {});

// Report uncaught JS errors to Crashlytics
const RNErrorUtils = (global as any).ErrorUtils;
if (RNErrorUtils) {
	const originalHandler = RNErrorUtils.getGlobalHandler();
	RNErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
		crashlytics().recordError(error);
		originalHandler(error, isFatal);
	});
}
import LoadingSpinner from "./src/components/LoadingSpinner";
import PoweredByTmdb from "./src/components/PoweredByTmdb";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import NetInfo from "@react-native-community/netinfo";
import { getAuth, onAuthStateChanged, reload } from "@react-native-firebase/auth";
import type { User } from "@react-native-firebase/auth";
import {
	getMessaging,
	getToken,
	requestPermission,
	getInitialNotification,
	onNotificationOpenedApp,
	onMessage,
} from "@react-native-firebase/messaging";
import { getFirestore, doc, setDoc } from "@react-native-firebase/firestore";
import { useAuthStore, useUiStore } from "./src/stores";
import { handleUpdateMessage, subscribeToUpdates } from "./src/services/updateNotifications";
import UpdatePrompt, { useReleaseWatch, useUpdateForced } from "./src/components/UpdateGate";
import LoginScreen from "./src/screens/LoginScreen";
import ImportDataScreen from "./src/screens/ImportDataScreen";
import AppNavigator from "./src/navigation/AppNavigator";
import { OfflineOverlay } from "./src/components";
import { colors } from "./src/theme";
import { AppOpenSource, FATAL_AUTH_ERRORS, OFFLINE_OVERLAY_DELAY_MS, QueryKey } from "./src/enums";
import { createConnectivityGate } from "./src/utils/connectivityGate";
import {
	initMixpanel,
	identifyUser,
	resetUser,
	trackAppOpened,
	flushAnalytics,
} from "./src/services/mixpanel";
import appConfig from "./app.json";

// Keep native splash visible until auth resolves
SplashScreen.preventAutoHideAsync();

GoogleSignin.configure({
	webClientId: "805605757351-l3oi0shjpalvspqoq1reve1otviuqvnu.apps.googleusercontent.com",
	offlineAccess: true,
	forceCodeForRefreshToken: true,
});

const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
	defaultOptions: {
		queries: { staleTime: 5 * 60 * 1000, retry: 2 },
	},
});
// A show's watched episodes back the info modal's counts — keep them for the session: the 5 min
// default dropped them, and reopening that show's modal re-read every watched episode from the
// server before it could open
queryClient.setQueryDefaults([QueryKey.WATCHED_EPISODES], { gcTime: Infinity });

const PERSIST_PREFIXES = ["upcomingEpisodes", "catalog"];

const asyncStoragePersister = createAsyncStoragePersister({
	storage: AsyncStorage,
	key: "tv-time-cache",
});

async function registerFCMToken(userId: string) {
	try {
		if (Platform.OS === "android" && Platform.Version >= 33) {
			const granted = await PermissionsAndroid.request(
				PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
			);
			if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
				console.warn("POST_NOTIFICATIONS permission denied");
				return;
			}
		}
		const msg = getMessaging();
		await requestPermission(msg);
		subscribeToUpdates();
		const token = await getToken(msg);
		const db = getFirestore();
		await setDoc(doc(db, "users", userId), { fcmToken: token }, { merge: true });
	} catch (err) {
		console.warn("FCM token registration failed:", err);
	}
}

/**
 * Background check that the account still exists server-side. Offline / slow / timed-out
 * reloads are ignored — only a definitive auth error (deleted, disabled, revoked) signs out.
 */
async function verifySession(user: User) {
	try {
		await reload(user);
	} catch (err) {
		const code = (err as { code?: string } | null)?.code;
		if (!code || !FATAL_AUTH_ERRORS.includes(code)) return;
		// Signed out / switched account meanwhile → nothing to do
		if (getAuth().currentUser?.uid !== user.uid) return;
		useAuthStore
			.getState()
			.signOut()
			.catch(() => {});
	}
}

/**
 * In-app updates around the app: the update drawer shows over login or the app when a newer build
 * is out. Forced: the app stays behind it with what it has cached (nothing is cleared, nobody is
 * signed out — refused callables just fail) but takes no touches, and the drawer can't be put off
 */
function AppContent() {
	useReleaseWatch();
	// An update push while the app is open: notify here too (the background handler in index.ts only
	// runs with the app in the background / closed, and the drawer only comes up on launch)
	useEffect(
		() =>
			onMessage(getMessaging(), (message) => {
				handleUpdateMessage(message);
			}),
		[],
	);
	const forced = useUpdateForced();
	return (
		<>
			<View style={styles.fill} pointerEvents={forced ? "none" : "auto"}>
				<AppScreens />
			</View>
			<UpdatePrompt />
		</>
	);
}

function AppScreens() {
	const {
		user,
		loading,
		appTmdbApiKey,
		appTmdbApiKeyLoading,
		userFlagsLoading,
		hasCompletedImport,
	} = useAuthStore();

	// Listen for background add failures (CF rollback)
	useEffect(() => {
		const { onAddTrackingErrorFallback } = require("./src/services/firestore");
		return onAddTrackingErrorFallback((_tmdbId: number, title: string) => {
			Alert.alert("Failed to Add", `"${title}" could not be added. Please try again.`);
		});
	}, []);

	useEffect(() => {
		if (!loading) {
			SplashScreen.hideAsync();
		}
	}, [loading]);

	if (loading) {
		return <SplashView />;
	}

	if (!user) {
		return <LoginScreen />;
	}

	if (appTmdbApiKeyLoading || userFlagsLoading) {
		return (
			<View style={styles.loading}>
				<LoadingSpinner />
			</View>
		);
	}

	if (!hasCompletedImport) {
		const markImportDone = () => {
			const uid = useAuthStore.getState().user?.uid;
			if (uid) useAuthStore.getState().markImportDone(uid);
		};
		return (
			<ImportDataScreen
				onboarding
				navigation={{
					navigate: markImportDone,
					goBack: markImportDone,
				}}
			/>
		);
	}

	return (
		<>
			<AppNavigator />
			<OfflineOverlay />
		</>
	);
}

/** Native splash colour / logo size (app.json expo-splash-screen) — the JS splash matches them */
const SPLASH_BG = "#0D0D0D";
/** TMDB credit's gap above the nav bar */
const SPLASH_CREDIT_GAP = 32;
const SPLASH_LOGO = require("./assets/icon-foreground.original.png");

/**
 * The splash, continued in JS so it can carry the TMDB credit at the bottom (the native splash
 * only takes one centred image): same colour and logo in the same place, so the hand-off from the
 * native splash (hidden once this is laid out) doesn't show
 */
function SplashView() {
	const { bottom } = useSafeAreaInsets();
	return (
		<View style={styles.splash} onLayout={() => SplashScreen.hideAsync()}>
			<Image source={SPLASH_LOGO} style={styles.splashLogo} contentFit="contain" />
			<View style={[styles.splashCredit, { bottom: bottom + SPLASH_CREDIT_GAP }]}>
				<PoweredByTmdb />
			</View>
		</View>
	);
}

export default function App() {
	// Non-blocking: text falls back to the system font until these load
	useFonts({ SmoochSans_400Regular, SmoochSans_500Medium, Handjet_800ExtraBold, VT323_400Regular });
	const setUser = useAuthStore((s) => s.setUser);
	const setConnected = useUiStore((s) => s.setConnected);

	useEffect(() => {
		initMixpanel();
		const appVersion = appConfig.expo.version;
		const msg = getMessaging();

		// Cold start: opened from a notification, a share link, or plainly
		Promise.all([
			getInitialNotification(msg).catch(() => null),
			Linking.getInitialURL().catch(() => null),
		]).then(([notification, url]) => {
			const source = notification
				? AppOpenSource.PUSH
				: url
					? AppOpenSource.DEEP_LINK
					: AppOpenSource.ORGANIC;
			trackAppOpened(source, appVersion);
		});

		// Resume: the push / link handlers fire around the same moment as the foreground change
		let resumeSource: AppOpenSource | null = null;
		const unsubscribePushOpen = onNotificationOpenedApp(msg, () => {
			resumeSource = AppOpenSource.PUSH;
		});
		const linkSub = Linking.addEventListener("url", () => {
			resumeSource ??= AppOpenSource.DEEP_LINK;
		});
		let appState = AppState.currentState;
		const appStateSub = AppState.addEventListener("change", (next) => {
			if (next === "background") flushAnalytics();
			if (appState === "background" && next === "active") {
				setTimeout(() => {
					trackAppOpened(resumeSource ?? AppOpenSource.ORGANIC, appVersion);
					resumeSource = null;
				}, 1000);
			}
			appState = next;
		});
		return () => {
			unsubscribePushOpen();
			linkSub.remove();
			appStateSub.remove();
		};
	}, []);

	useEffect(() => {
		let signedInUid: string | null = null;
		const unsubscribeAuth = onAuthStateChanged(getAuth(), (firebaseUser) => {
			// Persisted session is enough to enter (and hide the splash) — never wait on the network
			setUser(firebaseUser);
			if (firebaseUser) {
				crashlytics().setUserId(firebaseUser.uid);
				identifyUser(firebaseUser.uid, Date.parse(firebaseUser.metadata.creationTime ?? ""), {
					email: firebaseUser.email,
					name: firebaseUser.displayName,
				});
				signedInUid = firebaseUser.uid;
				registerFCMToken(firebaseUser.uid);
				verifySession(firebaseUser);
			} else {
				crashlytics().setUserId("");
				// Only a real sign-out resets — a signed-out cold start keeps its anonymous id
				if (signedInUid) resetUser();
				signedInUid = null;
			}
		});
		return unsubscribeAuth;
	}, [setUser]);

	useEffect(() => {
		// Offline only after OFFLINE_OVERLAY_DELAY_MS without a break (handovers drop for ~0.6 s);
		// null = not known yet, not offline
		const gate = createConnectivityGate(setConnected, OFFLINE_OVERLAY_DELAY_MS);
		const unsubscribeNet = NetInfo.addEventListener((state) => gate.update(state.isConnected));
		return () => {
			unsubscribeNet();
			gate.dispose();
		};
	}, [setConnected]);

	return (
		<GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
			<SafeAreaProvider>
				<PersistQueryClientProvider
					client={queryClient}
					persistOptions={{
						persister: asyncStoragePersister,
						maxAge: ONE_WEEK,
						dehydrateOptions: {
							shouldDehydrateQuery: (q) => {
								const key = q.queryKey[0] as string;
								return PERSIST_PREFIXES.includes(key) && q.state.status === "success";
							},
						},
					}}
				>
					<AppContent />
				</PersistQueryClientProvider>
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}

const styles = StyleSheet.create({
	fill: { flex: 1 },
	loading: {
		flex: 1,
		backgroundColor: colors.background,
		justifyContent: "center",
		alignItems: "center",
	},
	splash: {
		...StyleSheet.absoluteFill,
		backgroundColor: SPLASH_BG,
		justifyContent: "center",
		alignItems: "center",
	},
	splashLogo: {
		width: 120,
		height: 120,
	},
	splashCredit: { position: "absolute", left: 0, right: 0 },
});
