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
  setDoc,
} from "@react-native-firebase/firestore";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

interface AuthState {
  user: User | null;
  loading: boolean;
  tmdbApiKey: string | null;
  tmdbApiKeyLoading: boolean;
  hasSeenImport: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  setTmdbApiKey: (key: string) => void;
  setHasSeenImport: (val: boolean) => void;
  loadTmdbApiKey: (userId: string) => Promise<void>;
  saveTmdbApiKey: (userId: string, key: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  tmdbApiKey: null,
  tmdbApiKeyLoading: true,
  hasSeenImport: false,

  setUser: (user) => set({ user, loading: false }),
  setLoading: (loading) => set({ loading }),
  setTmdbApiKey: (key) => set({ tmdbApiKey: key, tmdbApiKeyLoading: false }),
  setHasSeenImport: (val) => set({ hasSeenImport: val }),

  loadTmdbApiKey: async (userId: string) => {
    try {
      const db = getFirestore();
      const snap = await getDoc(doc(db, "users", userId));
      const key = snap.data()?.tmdbApiKey || null;
      set({ tmdbApiKey: key, tmdbApiKeyLoading: false });
    } catch (error) {
      console.error("Failed to load TMDB API key:", error);
      set({ tmdbApiKeyLoading: false });
    }
  },

  saveTmdbApiKey: async (userId: string, key: string) => {
    const db = getFirestore();
    const docRef = doc(db, "users", userId);
    const snap = await getDoc(docRef);
    const updateData: Record<string, unknown> = { tmdbApiKey: key };
    if (!snap.exists() || !snap.data()?.stats) {
      updateData.stats = {
        episodesWatched: 0,
        showsTracking: 0,
        totalMinutes: 0,
      };
    }
    await setDoc(docRef, updateData, { merge: true });
    set({ tmdbApiKey: key, tmdbApiKeyLoading: false });
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
      set({ tmdbApiKey: null, tmdbApiKeyLoading: true });
    } catch (error) {
      console.error("Sign out error:", error);
      throw error;
    }
  },
}));
