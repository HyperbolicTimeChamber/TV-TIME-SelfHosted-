import { create } from "zustand";
import {
	GoogleAuthProvider,
	signInWithCredential,
	getAuth,
	signInWithEmailAndPassword,
	createUserWithEmailAndPassword,
	signOut as firebaseSignOut,
} from "@react-native-firebase/auth";
import type { User } from "@react-native-firebase/auth";
import {
	getFirestore,
	doc,
	getDocFromCache,
	getDocFromServer,
} from "@react-native-firebase/firestore";
import type { DocumentSnapshot } from "@react-native-firebase/firestore";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { MIN_BUILD_FIELD, RELEASE_CHANNEL, ReleaseChannel } from "../enums";

/** Max wait on a startup server read when nothing is cached (then fall back; a late answer still applies) */
const STARTUP_READ_TIMEOUT = 10_000;

interface AuthState {
	user: User | null;
	loading: boolean;
	appTmdbApiKey: string | null;
	appTmdbApiKeyLoading: boolean;
	hasCompletedImport: boolean;
	userFlagsLoading: boolean;
	/** Minimum build number for this build's release channel (config/app) */
	minBuild: number | null;
	/** ISO string of config/app.lastCatalogSync (weekly server catalog refresh) */
	lastCatalogSync: string | null;
	/** Sync before lastCatalogSync — caches stamped with it only need changedShowIds re-read */
	previousCatalogSync: string | null;
	/** Show doc ids changed by the last sync */
	changedShowIds: string[] | null;
	setUser: (user: User | null) => void;
	setLoading: (loading: boolean) => void;
	loadAppConfig: () => Promise<void>;
	loadUserFlags: (userId: string) => Promise<void>;
	signInWithGoogle: () => Promise<void>;
	signInWithEmail: (email: string, password: string) => Promise<void>;
	signUpWithEmail: (email: string, password: string) => Promise<void>;
	signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
	user: null,
	loading: true,
	appTmdbApiKey: null,
	appTmdbApiKeyLoading: true,
	hasCompletedImport: false,
	userFlagsLoading: true,
	minBuild: null,
	lastCatalogSync: null,
	previousCatalogSync: null,
	changedShowIds: null,

	setUser: (user) => {
		set({ user, loading: false, userFlagsLoading: !!user });
		if (user) {
			const store = useAuthStore.getState();
			store.loadAppConfig();
			store.loadUserFlags(user.uid);
		}
	},

	setLoading: (loading) => set({ loading }),

	loadAppConfig: async () => {
		const ref = doc(getFirestore(), "config", "app");
		const apply = (snap: DocumentSnapshot): boolean => {
			if (!snap.exists()) return false;
			const data = snap.data();
			set({
				appTmdbApiKey: data?.tmdbApiKey ?? null,
				minBuild:
					(data?.[MIN_BUILD_FIELD[RELEASE_CHANNEL as ReleaseChannel]] as number | undefined) ??
					null,
				lastCatalogSync: data?.lastCatalogSync?.toDate?.()?.toISOString?.() ?? null,
				previousCatalogSync: data?.previousCatalogSync?.toDate?.()?.toISOString?.() ?? null,
				changedShowIds: Array.isArray(data?.changedShowIds) ? data.changedShowIds : null,
			});
			return true;
		};
		// Offline cache unblocks startup instantly (no billed read); server copy refreshes below
		const cached = await getDocFromCache(ref)
			.then(apply)
			.catch(() => false);
		if (cached) set({ appTmdbApiKeyLoading: false });
		// Nothing cached → don't block the app forever on a slow network
		const timeout = setTimeout(() => set({ appTmdbApiKeyLoading: false }), STARTUP_READ_TIMEOUT);
		try {
			apply(await getDocFromServer(ref));
		} catch (error) {
			console.warn("Failed to refresh app config:", error);
		} finally {
			clearTimeout(timeout);
			set({ appTmdbApiKeyLoading: false });
		}
	},

	loadUserFlags: async (userId: string) => {
		const ref = doc(getFirestore(), "users", userId);
		const apply = (snap: DocumentSnapshot): boolean => {
			// Signed out / switched account meanwhile → drop the stale result
			if (useAuthStore.getState().user?.uid !== userId) return false;
			// Missing doc (fresh account) → keep the default
			if (!snap.exists()) return false;
			set({ hasCompletedImport: snap.data()?.hasCompletedImport ?? false });
			return true;
		};
		const cached = await getDocFromCache(ref)
			.then(apply)
			.catch(() => false);
		if (cached) set({ userFlagsLoading: false });
		// Nothing cached → wait for the server, but not forever (a late answer still applies)
		const timeout = setTimeout(() => set({ userFlagsLoading: false }), STARTUP_READ_TIMEOUT);
		try {
			apply(await getDocFromServer(ref));
		} catch (error) {
			console.warn("Failed to refresh user flags:", error);
		} finally {
			clearTimeout(timeout);
			set({ userFlagsLoading: false });
		}
	},

	signInWithGoogle: async () => {
		try {
			await GoogleSignin.hasPlayServices({
				showPlayServicesUpdateDialog: true,
			});
			const signInResult = await GoogleSignin.signIn();
			const idToken = signInResult.data?.idToken;
			if (!idToken) throw new Error("No ID token");

			const googleCredential = GoogleAuthProvider.credential(idToken, idToken);
			await signInWithCredential(getAuth(), googleCredential);
		} catch (error) {
			console.error("Google sign in error:", error);
			throw error;
		}
	},

	signInWithEmail: async (email: string, password: string) => {
		try {
			await signInWithEmailAndPassword(getAuth(), email, password);
		} catch (error) {
			console.error("Email sign in error:", error);
			throw error;
		}
	},

	signUpWithEmail: async (email: string, password: string) => {
		try {
			await createUserWithEmailAndPassword(getAuth(), email, password);
		} catch (error) {
			console.error("Email sign up error:", error);
			throw error;
		}
	},

	signOut: async () => {
		try {
			const auth = getAuth();
			const currentUser = auth.currentUser;
			const isGoogleUser = currentUser?.providerData.some((p) => p.providerId === "google.com");
			// Firebase sign-out is local — leave the app straight away. Revoking Google access is a
			// network round trip: awaited first, it held the user on Settings on a slow connection
			await firebaseSignOut(auth);
			if (isGoogleUser) GoogleSignin.revokeAccess().catch(() => {});
			set({
				appTmdbApiKey: null,
				appTmdbApiKeyLoading: true,
				hasCompletedImport: false,
				minBuild: null,
				lastCatalogSync: null,
				previousCatalogSync: null,
				changedShowIds: null,
			});
		} catch (error) {
			console.error("Sign out error:", error);
			throw error;
		}
	},
}));
