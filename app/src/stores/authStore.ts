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
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  tmdbApiKey: null,
  tmdbApiKeyLoading: true,

  setUser: (user) => set({ user, loading: false }),
  setLoading: (loading) => set({ loading }),
  setTmdbApiKey: (key) => set({ tmdbApiKey: key }),

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
    await firestore().collection("users").doc(userId).update({ tmdbApiKey: key });
    set({ tmdbApiKey: key });
  },

  signIn: async () => {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;
      if (!idToken) throw new Error("No ID token");

      const googleCredential = auth.GoogleAuthProvider.credential(idToken);
      await auth().signInWithCredential(googleCredential);
    } catch (error) {
      console.error("Sign in error:", error);
      throw error;
    }
  },

  signOut: async () => {
    try {
      await GoogleSignin.revokeAccess();
      await auth().signOut();
      set({ tmdbApiKey: null, tmdbApiKeyLoading: true });
    } catch (error) {
      console.error("Sign out error:", error);
      throw error;
    }
  },
}));
