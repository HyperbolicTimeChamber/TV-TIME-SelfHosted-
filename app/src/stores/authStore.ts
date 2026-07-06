import { create } from "zustand";
import auth, { FirebaseAuthTypes } from "@react-native-firebase/auth";
import firestore from "@react-native-firebase/firestore";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

interface AuthState {
  user: FirebaseAuthTypes.User | null;
  loading: boolean;
  tmdbApiKey: string | null;
  tmdbApiKeyLoading: boolean;
  setUser: (user: FirebaseAuthTypes.User | null) => void;
  setLoading: (loading: boolean) => void;
  setTmdbApiKey: (key: string) => void;
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

  setUser: (user) => set({ user, loading: false }),
  setLoading: (loading) => set({ loading }),
  setTmdbApiKey: (key) => set({ tmdbApiKey: key, tmdbApiKeyLoading: false }),

  loadTmdbApiKey: async (userId: string) => {
    try {
      const doc = await firestore().collection("users").doc(userId).get();
      const key = doc.data()?.tmdbApiKey || null;
      set({ tmdbApiKey: key, tmdbApiKeyLoading: false });
    } catch (error) {
      console.error("Failed to load TMDB API key:", error);
      set({ tmdbApiKeyLoading: false });
    }
  },

  saveTmdbApiKey: async (userId: string, key: string) => {
    const docRef = firestore().collection("users").doc(userId);
    const doc = await docRef.get();
    const updateData: Record<string, unknown> = { tmdbApiKey: key };
    if (!doc.exists() || !doc.data()?.stats) {
      updateData.stats = {
        episodesWatched: 0,
        showsTracking: 0,
        totalMinutes: 0,
      };
    }
    await docRef.set(updateData, { merge: true });
    set({ tmdbApiKey: key, tmdbApiKeyLoading: false });
  },

  signInWithGoogle: async () => {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;
      if (!idToken) throw new Error("No ID token");

      const googleCredential = auth.GoogleAuthProvider.credential(idToken);
      await auth().signInWithCredential(googleCredential);
    } catch (error) {
      console.error("Google sign in error:", error);
      throw error;
    }
  },

  signInWithEmail: async (email: string, password: string) => {
    try {
      await auth().signInWithEmailAndPassword(email, password);
    } catch (error) {
      console.error("Email sign in error:", error);
      throw error;
    }
  },

  signUpWithEmail: async (email: string, password: string) => {
    try {
      await auth().createUserWithEmailAndPassword(email, password);
    } catch (error) {
      console.error("Email sign up error:", error);
      throw error;
    }
  },

  signOut: async () => {
    try {
      const currentUser = auth().currentUser;
      const isGoogleUser = currentUser?.providerData.some(
        (p) => p.providerId === "google.com"
      );
      if (isGoogleUser) {
        await GoogleSignin.revokeAccess().catch(() => {});
      }
      await auth().signOut();
      set({ tmdbApiKey: null, tmdbApiKeyLoading: true });
    } catch (error) {
      console.error("Sign out error:", error);
      throw error;
    }
  },
}));
