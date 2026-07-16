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
  getDoc,
} from "@react-native-firebase/firestore";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

interface AuthState {
  user: User | null;
  loading: boolean;
  appTmdbApiKey: string | null;
  appTmdbApiKeyLoading: boolean;
  hasCompletedImport: boolean;
  userFlagsLoading: boolean;
  minVersion: string | null;
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
  minVersion: null,

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
      console.log("Step 1: checking play services");
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      console.log("Step 2: calling GoogleSignin.signIn()");
      const signInResult = await GoogleSignin.signIn();
      console.log("Step 3: got result", JSON.stringify(signInResult));
      const idToken = signInResult.data?.idToken;
      const serverAuthCode = signInResult.data?.serverAuthCode;
      console.log("idToken:", !!idToken, "serverAuthCode:", !!serverAuthCode);
      if (!idToken) throw new Error("No ID token");

      console.log("Step 4: creating Firebase credential");
      const googleCredential = GoogleAuthProvider.credential(idToken, idToken);
      await signInWithCredential(getAuth(), googleCredential);
      console.log("Step 5: signed in");
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
      const isGoogleUser = currentUser?.providerData.some(
        (p) => p.providerId === "google.com"
      );
      if (isGoogleUser) {
        await GoogleSignin.revokeAccess().catch(() => {});
      }
      await firebaseSignOut(auth);
      set({
        appTmdbApiKey: null,
        appTmdbApiKeyLoading: true,
        hasCompletedImport: false,
        minVersion: null,
      });
    } catch (error) {
      console.error("Sign out error:", error);
      throw error;
    }
  },
}));
