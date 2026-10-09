import { create } from "zustand";
import {
	GoogleAuthProvider,
	signInWithCredential,
	getAuth,
	signInWithEmailAndPassword,
	createUserWithEmailAndPassword,
	updateProfile,
	signOut as firebaseSignOut,
} from "@react-native-firebase/auth";
import type { User } from "@react-native-firebase/auth";
import { getFirestore, doc, getDoc } from "@react-native-firebase/firestore";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { isEmailIdentifier, usernameToEmail, normalizeUsername } from "../utils";

interface AuthState {
	user: User | null;
	loading: boolean;
	appTmdbApiKey: string | null;
	appTmdbApiKeyLoading: boolean;
	hasCompletedImport: boolean;
	userFlagsLoading: boolean;
	minVersion: string | null;
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
	/** identifier = email or username */
	signInWithEmail: (identifier: string, password: string) => Promise<void>;
	signUpWithEmail: (identifier: string, password: string) => Promise<void>;
	signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
	user: null,
	loading: true,
	appTmdbApiKey: null,
	appTmdbApiKeyLoading: true,
	hasCompletedImport: false,
	userFlagsLoading: true,
	minVersion: null,
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
		// Timeout fallback — don't block app forever
		const timeout = setTimeout(() => {
			set({ appTmdbApiKeyLoading: false });
		}, 10000);
		try {
			const db = getFirestore();
			const configDoc = await getDoc(doc(db, "config", "app"));
			if (configDoc.exists()) {
				const data = configDoc.data();
				set({
					appTmdbApiKey: data?.tmdbApiKey ?? null,
					minVersion: data?.minVersion ?? null,
					lastCatalogSync: data?.lastCatalogSync?.toDate?.()?.toISOString?.() ?? null,
					previousCatalogSync: data?.previousCatalogSync?.toDate?.()?.toISOString?.() ?? null,
					changedShowIds: Array.isArray(data?.changedShowIds) ? data.changedShowIds : null,
				});
			}
		} catch (error) {
			console.error("Failed to load app config:", error);
		} finally {
			clearTimeout(timeout);
			set({ appTmdbApiKeyLoading: false });
		}
	},

	loadUserFlags: async (userId: string) => {
		try {
			const db = getFirestore();
			const userDoc = await getDoc(doc(db, "users", userId));
			if (userDoc.exists()) {
				set({
					hasCompletedImport: userDoc.data()?.hasCompletedImport ?? false,
				});
			}
		} catch (error) {
			console.error("Failed to load user flags:", error);
		} finally {
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

	signInWithEmail: async (identifier: string, password: string) => {
		try {
			const email = isEmailIdentifier(identifier) ? identifier : usernameToEmail(identifier);
			await signInWithEmailAndPassword(getAuth(), email, password);
		} catch (error) {
			console.error("Email sign in error:", error);
			throw error;
		}
	},

	signUpWithEmail: async (identifier: string, password: string) => {
		try {
			if (isEmailIdentifier(identifier)) {
				await createUserWithEmailAndPassword(getAuth(), identifier, password);
				return;
			}
			// Username → synthetic email. Firebase rejects duplicates with
			// auth/email-already-in-use, which the login screen maps to "username taken".
			const username = normalizeUsername(identifier);
			const cred = await createUserWithEmailAndPassword(
				getAuth(),
				usernameToEmail(username),
				password,
			);
			await updateProfile(cred.user, { displayName: username }).catch(() => {});
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
			if (isGoogleUser) {
				await GoogleSignin.revokeAccess().catch(() => {});
			}
			await firebaseSignOut(auth);
			set({
				appTmdbApiKey: null,
				appTmdbApiKeyLoading: true,
				hasCompletedImport: false,
				minVersion: null,
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
