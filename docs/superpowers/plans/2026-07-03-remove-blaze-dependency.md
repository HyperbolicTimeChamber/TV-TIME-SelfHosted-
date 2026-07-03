# Remove Blaze Dependency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all Cloud Functions so the app runs entirely on Firebase Spark (free) plan. Users store their own TMDB API key, app queries TMDB directly, stats updates happen client-side in batch writes.

**Architecture:** Replace Cloud Function TMDB proxy with direct client-side TMDB API calls using per-user API keys stored in Firestore. Replace Firestore triggers with atomic batch writes that update stats inline. Add onboarding gate screen for API key entry.

**Tech Stack:** React Native 0.86 / Expo 57, TypeScript, React Navigation 7, TanStack React Query 5, Zustand 5, @react-native-firebase/* 25, axios (new dep for TMDB calls)

## Global Constraints

- Expo SDK 57 — read docs at https://docs.expo.dev/versions/v57.0.0/ before writing code
- React Native 0.86, React 19
- Dark theme only — use existing `colors`, `spacing`, `typography` from `app/src/theme/index.ts`
- All Firestore writes for episodes/watchlist MUST include stats updates in same batch
- TMDB API v3 — base URL `https://api.themoviedb.org/3`
- No new navigation libraries — use existing @react-navigation stack

---

### Task 1: Update Types and Auth Store for TMDB API Key

**Files:**
- Modify: `app/src/types/index.ts:12-18` (UserProfile interface)
- Modify: `app/src/types/index.ts:100-104` (RootStackParamList)
- Modify: `app/src/stores/authStore.ts` (full file rewrite)

**Interfaces:**
- Produces: `UserProfile.tmdbApiKey: string` field used by Task 2 (TMDB service) and Task 3 (onboarding screen)
- Produces: `useAuthStore` with `tmdbApiKey: string | null`, `tmdbApiKeyLoading: boolean`, `setTmdbApiKey(key: string)` used by Tasks 2, 3, 4, 5
- Produces: `RootStackParamList.ApiKeySetup: undefined` used by Task 4 (App.tsx gate)

- [ ] **Step 1: Add `tmdbApiKey` to `UserProfile` and nav types**

In `app/src/types/index.ts`, add `tmdbApiKey` field to `UserProfile` and `ApiKeySetup` to nav params:

```typescript
// Line 12-18: Add tmdbApiKey to UserProfile
export interface UserProfile {
  displayName: string;
  email: string;
  photoURL: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  stats: UserStats;
  tmdbApiKey: string;
}

// Line 100-104: Add ApiKeySetup to RootStackParamList
export type RootStackParamList = {
  Login: undefined;
  ApiKeySetup: undefined;
  Main: undefined;
};
```

- [ ] **Step 2: Rewrite auth store to include TMDB API key state**

Replace `app/src/stores/authStore.ts` entirely:

```typescript
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
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit 2>&1 | head -30`
Expected: Type errors in files that still import from `services/functions` (expected at this stage). No errors in `types/index.ts` or `authStore.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/src/types/index.ts app/src/stores/authStore.ts
git commit -m "feat: add tmdbApiKey to UserProfile and auth store

Add tmdbApiKey field to UserProfile type, ApiKeySetup to nav params,
and extend authStore with key loading/saving from Firestore.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Create Client-Side TMDB Service

**Files:**
- Create: `app/src/services/tmdb.ts`
- Modify: `app/package.json` (add axios dependency)

**Interfaces:**
- Consumes: `useAuthStore.tmdbApiKey` from Task 1
- Produces: `searchMulti(apiKey: string, query: string, page?: number)` — returns `{ results: TMDBShow[], page: number, totalPages: number, totalResults: number }`
- Produces: `getTrending(apiKey: string, mediaType?: string, timeWindow?: string)` — returns `{ results: TMDBShow[], page: number, totalPages: number }`
- Produces: `getShowDetails(apiKey: string, tmdbId: number, mediaType?: string)` — returns `TMDBShow`
- Produces: `getSeasonDetails(apiKey: string, tmdbId: number, seasonNumber: number)` — returns `{ episodes: TMDBEpisode[], name: string, season_number: number }`
- Produces: `getUpcomingEpisodes(apiKey: string, tmdbIds: number[])` — returns `{ episodes: UpcomingEpisode[] }`

- [ ] **Step 1: Install axios**

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npm install axios`

- [ ] **Step 2: Create TMDB service**

Create `app/src/services/tmdb.ts`:

```typescript
import axios from "axios";
import { TMDBShow, TMDBEpisode, UpcomingEpisode } from "../types";

const TMDB_BASE = "https://api.themoviedb.org/3";

function tmdb(apiKey: string) {
  return axios.create({
    baseURL: TMDB_BASE,
    params: { api_key: apiKey },
  });
}

export async function searchMulti(apiKey: string, query: string, page: number = 1) {
  const res = await tmdb(apiKey).get("/search/multi", {
    params: { query, page },
  });
  return {
    results: res.data.results as TMDBShow[],
    page: res.data.page as number,
    totalPages: res.data.total_pages as number,
    totalResults: res.data.total_results as number,
  };
}

export async function getTrending(
  apiKey: string,
  mediaType: string = "tv",
  timeWindow: string = "week"
) {
  const res = await tmdb(apiKey).get(`/trending/${mediaType}/${timeWindow}`);
  return {
    results: res.data.results as TMDBShow[],
    page: res.data.page as number,
    totalPages: res.data.total_pages as number,
  };
}

export async function getShowDetails(
  apiKey: string,
  tmdbId: number,
  mediaType: string = "tv"
) {
  const res = await tmdb(apiKey).get(`/${mediaType}/${tmdbId}`, {
    params: { append_to_response: "credits,similar" },
  });
  return res.data as TMDBShow;
}

export async function getSeasonDetails(
  apiKey: string,
  tmdbId: number,
  seasonNumber: number
) {
  const res = await tmdb(apiKey).get(`/tv/${tmdbId}/season/${seasonNumber}`);
  return res.data as { episodes: TMDBEpisode[]; name: string; season_number: number };
}

export async function getUpcomingEpisodes(apiKey: string, tmdbIds: number[]) {
  const results = await Promise.all(
    tmdbIds.map(async (id) => {
      try {
        const res = await tmdb(apiKey).get(`/tv/${id}`);
        const show = res.data;
        if (!show.next_episode_to_air) return null;
        const ep = show.next_episode_to_air;
        return {
          tmdbShowId: id,
          showTitle: show.name,
          posterPath: show.poster_path,
          season: ep.season_number,
          episode: ep.episode_number,
          episodeTitle: ep.name,
          airDate: ep.air_date,
          runtime: ep.runtime ?? null,
        } as UpcomingEpisode;
      } catch {
        return null;
      }
    })
  );
  return { episodes: results.filter((e): e is UpcomingEpisode => e !== null) };
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    await tmdb(apiKey).get("/configuration");
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Verify file compiles**

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit 2>&1 | grep "tmdb.ts"`
Expected: No errors from `tmdb.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/src/services/tmdb.ts app/package.json app/package-lock.json
git commit -m "feat: add client-side TMDB API service

Direct TMDB v3 API queries using per-user API key.
Replaces Cloud Function proxy with axios client.
Includes key validation via /configuration endpoint.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Create API Key Setup Screen

**Files:**
- Create: `app/src/screens/ApiKeySetupScreen.tsx`

**Interfaces:**
- Consumes: `useAuthStore.user`, `useAuthStore.saveTmdbApiKey()` from Task 1
- Consumes: `validateApiKey()` from Task 2
- Produces: Screen component used by Task 4 (App.tsx gate)

- [ ] **Step 1: Create API Key Setup Screen**

Create `app/src/screens/ApiKeySetupScreen.tsx`:

```typescript
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useAuthStore } from "../stores/authStore";
import { validateApiKey } from "../services/tmdb";
import { colors, spacing, typography } from "../theme";

export default function ApiKeySetupScreen() {
  const user = useAuthStore((s) => s.user);
  const saveTmdbApiKey = useAuthStore((s) => s.saveTmdbApiKey);
  const [apiKey, setApiKey] = useState("");
  const [validating, setValidating] = useState(false);

  const handleSubmit = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed || !user) return;

    setValidating(true);
    try {
      const valid = await validateApiKey(trimmed);
      if (!valid) {
        Alert.alert("Invalid API Key", "Could not validate this key with TMDB. Check it and try again.");
        return;
      }
      await saveTmdbApiKey(user.uid, trimmed);
    } catch (error) {
      Alert.alert("Error", "Failed to save API key. Please try again.");
    } finally {
      setValidating(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>TMDB API Key</Text>
        <Text style={styles.description}>
          This app uses The Movie Database (TMDB) to fetch show and movie data.
          You need a free API key to continue.
        </Text>

        <TouchableOpacity
          onPress={() => Linking.openURL("https://www.themoviedb.org/settings/api")}
        >
          <Text style={styles.link}>Get your free API key from TMDB</Text>
        </TouchableOpacity>

        <Text style={styles.label}>API Key (v3 auth)</Text>
        <TextInput
          style={styles.input}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="Enter your TMDB API key"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!validating}
        />

        <TouchableOpacity
          style={[styles.button, (!apiKey.trim() || validating) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!apiKey.trim() || validating}
        >
          {validating ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.buttonText}>Save & Continue</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  title: {
    ...typography.title,
    fontSize: 28,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  link: {
    ...typography.body,
    color: colors.accent,
    textAlign: "center",
    textDecorationLine: "underline",
    marginBottom: spacing.xxl,
  },
  label: {
    ...typography.subtitle,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing.lg,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    ...typography.subtitle,
    color: colors.text,
  },
});
```

- [ ] **Step 2: Verify file compiles**

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit 2>&1 | grep "ApiKeySetupScreen"`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/screens/ApiKeySetupScreen.tsx
git commit -m "feat: add API key setup screen for TMDB onboarding

Gate screen shown after login if user has no TMDB API key.
Validates key against TMDB /configuration before saving.
Includes link to TMDB API key signup page.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Update App.tsx Gate and Hook Up Onboarding Flow

**Files:**
- Modify: `app/App.tsx` (full file)

**Interfaces:**
- Consumes: `useAuthStore.tmdbApiKey`, `useAuthStore.tmdbApiKeyLoading`, `useAuthStore.loadTmdbApiKey()` from Task 1
- Consumes: `ApiKeySetupScreen` from Task 3

- [ ] **Step 1: Update App.tsx with API key gate**

Replace `app/App.tsx`:

```typescript
import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import NetInfo from "@react-native-community/netinfo";
import auth from "@react-native-firebase/auth";
import { useAuthStore } from "./src/stores/authStore";
import { useUiStore } from "./src/stores/uiStore";
import LoginScreen from "./src/screens/LoginScreen";
import ApiKeySetupScreen from "./src/screens/ApiKeySetupScreen";
import AppNavigator from "./src/navigation/AppNavigator";
import OfflineOverlay from "./src/components/OfflineOverlay";
import { colors } from "./src/theme";

// TODO: Replace with your web client ID from Firebase Console
GoogleSignin.configure({
  webClientId: "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com",
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, retry: 2 },
  },
});

function AppContent() {
  const { user, loading, setUser, tmdbApiKey, tmdbApiKeyLoading, loadTmdbApiKey } =
    useAuthStore();
  const setConnected = useUiStore((s) => s.setConnected);

  useEffect(() => {
    const unsubscribeAuth = auth().onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        loadTmdbApiKey(firebaseUser.uid);
      }
    });
    return unsubscribeAuth;
  }, [setUser, loadTmdbApiKey]);

  useEffect(() => {
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      setConnected(state.isConnected ?? false);
    });
    return unsubscribeNet;
  }, [setConnected]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (tmdbApiKeyLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!tmdbApiKey) {
    return <ApiKeySetupScreen />;
  }

  return (
    <>
      <AppNavigator />
      <OfflineOverlay />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppContent />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
});
```

- [ ] **Step 2: Verify file compiles**

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit 2>&1 | grep "App.tsx"`
Expected: No errors from `App.tsx`.

- [ ] **Step 3: Commit**

```bash
git add app/App.tsx
git commit -m "feat: add API key gate to app entry point

After login, checks if user has TMDB API key in Firestore.
Shows ApiKeySetupScreen if missing, main app if present.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Update React Query Hooks to Use TMDB Service

**Files:**
- Modify: `app/src/hooks/useSearch.ts` (full file)
- Modify: `app/src/hooks/useTrending.ts` (full file)
- Modify: `app/src/hooks/useShowDetails.ts` (full file)
- Modify: `app/src/hooks/useSeasonDetails.ts` (full file)
- Modify: `app/src/hooks/useUpcomingEpisodes.ts` (full file)
- Delete: `app/src/services/functions.ts`

**Interfaces:**
- Consumes: `searchMulti`, `getTrending`, `getShowDetails`, `getSeasonDetails`, `getUpcomingEpisodes` from Task 2 (tmdb service)
- Consumes: `useAuthStore.tmdbApiKey` from Task 1
- Produces: Same hook interfaces as before (no consumer changes needed)

- [ ] **Step 1: Update useSearch.ts**

Replace `app/src/hooks/useSearch.ts`:

```typescript
import { useInfiniteQuery } from "@tanstack/react-query";
import { searchMulti } from "../services/tmdb";
import { useAuthStore } from "../stores/authStore";
import { TMDBShow } from "../types";

export function useSearch(query: string) {
  const apiKey = useAuthStore((s) => s.tmdbApiKey)!;

  return useInfiniteQuery({
    queryKey: ["search", query],
    queryFn: ({ pageParam = 1 }) => searchMulti(apiKey, query, pageParam),
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    enabled: query.length > 0,
    select: (data) => ({
      pages: data.pages,
      pageParams: data.pageParams,
      results: data.pages.flatMap((p) => p.results) as unknown as TMDBShow[],
    }),
  });
}
```

- [ ] **Step 2: Update useTrending.ts**

Replace `app/src/hooks/useTrending.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { getTrending } from "../services/tmdb";
import { useAuthStore } from "../stores/authStore";
import { TMDBShow } from "../types";

export function useTrending(mediaType: string = "tv") {
  const apiKey = useAuthStore((s) => s.tmdbApiKey)!;

  return useQuery({
    queryKey: ["trending", mediaType],
    queryFn: () => getTrending(apiKey, mediaType),
    staleTime: 60 * 60 * 1000,
    select: (data) => data.results as unknown as TMDBShow[],
  });
}
```

- [ ] **Step 3: Update useShowDetails.ts**

Replace `app/src/hooks/useShowDetails.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { getShowDetails } from "../services/tmdb";
import { useAuthStore } from "../stores/authStore";
import { TMDBShow } from "../types";

export function useShowDetails(tmdbId: number, mediaType: string = "tv") {
  const apiKey = useAuthStore((s) => s.tmdbApiKey)!;

  return useQuery({
    queryKey: ["show", tmdbId, mediaType],
    queryFn: () => getShowDetails(apiKey, tmdbId, mediaType),
    staleTime: 24 * 60 * 60 * 1000,
    select: (data) => data as unknown as TMDBShow,
  });
}
```

- [ ] **Step 4: Update useSeasonDetails.ts**

Replace `app/src/hooks/useSeasonDetails.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { getSeasonDetails } from "../services/tmdb";
import { useAuthStore } from "../stores/authStore";
import { TMDBEpisode } from "../types";

export function useSeasonDetails(tmdbId: number, seasonNumber: number) {
  const apiKey = useAuthStore((s) => s.tmdbApiKey)!;

  return useQuery({
    queryKey: ["season", tmdbId, seasonNumber],
    queryFn: () => getSeasonDetails(apiKey, tmdbId, seasonNumber),
    staleTime: 24 * 60 * 60 * 1000,
    select: (data) => {
      const d = data as { episodes: TMDBEpisode[]; name: string; season_number: number };
      return d;
    },
  });
}
```

- [ ] **Step 5: Update useUpcomingEpisodes.ts**

Replace `app/src/hooks/useUpcomingEpisodes.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { getUpcomingEpisodes } from "../services/tmdb";
import { useAuthStore } from "../stores/authStore";
import { UpcomingEpisode } from "../types";

export function useUpcomingEpisodes(tmdbIds: number[]) {
  const apiKey = useAuthStore((s) => s.tmdbApiKey)!;

  return useQuery({
    queryKey: ["upcoming", tmdbIds],
    queryFn: () => getUpcomingEpisodes(apiKey, tmdbIds),
    staleTime: 60 * 60 * 1000,
    enabled: tmdbIds.length > 0,
    select: (data) => data.episodes as UpcomingEpisode[],
  });
}
```

- [ ] **Step 6: Delete functions.ts**

Run: `rm /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app/src/services/functions.ts`

- [ ] **Step 7: Verify all hooks compile**

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors from hook files or services. May still have errors from other files if they import functions.ts (should be none — only hooks imported from functions.ts).

- [ ] **Step 8: Commit**

```bash
git add app/src/hooks/useSearch.ts app/src/hooks/useTrending.ts app/src/hooks/useShowDetails.ts app/src/hooks/useSeasonDetails.ts app/src/hooks/useUpcomingEpisodes.ts
git rm app/src/services/functions.ts
git commit -m "feat: switch all hooks from Cloud Functions to direct TMDB API

All React Query hooks now call tmdb service directly using
per-user API key from auth store. Deleted functions.ts wrapper.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Add Batch Writes for Stats Updates in Firestore Service

**Files:**
- Modify: `app/src/services/firestore.ts` (full file)

**Interfaces:**
- Consumes: Same function signatures as before — callers don't change
- Produces: Same exports as before, but now each write includes atomic stats updates

- [ ] **Step 1: Rewrite firestore.ts with batch writes for stats**

Replace `app/src/services/firestore.ts`:

```typescript
import firestore from "@react-native-firebase/firestore";
import { WatchStatus, MediaType } from "../types";

const db = firestore();

function userRef(userId: string) {
  return db.collection("users").doc(userId);
}

function watchlistRef(userId: string) {
  return userRef(userId).collection("watchlist");
}

function watchedEpisodesRef(userId: string) {
  return userRef(userId).collection("watchedEpisodes");
}

function episodeDocId(tmdbShowId: number, season: number, episode: number) {
  const s = String(season).padStart(2, "0");
  const e = String(episode).padStart(2, "0");
  return `${tmdbShowId}_S${s}E${e}`;
}

export async function addToWatchlist(
  userId: string,
  tmdbId: number,
  mediaType: MediaType,
  title: string,
  posterPath: string,
  firstEpisode?: { season: number; episode: number }
) {
  const batch = db.batch();
  batch.set(watchlistRef(userId).doc(String(tmdbId)), {
    tmdbId,
    mediaType,
    title,
    posterPath,
    addedAt: firestore.FieldValue.serverTimestamp(),
    lastWatchedAt: null,
    status: "watching" as WatchStatus,
    nextEpisode: firstEpisode || (mediaType === "tv" ? { season: 1, episode: 1 } : null),
    rewatchCount: 0,
  });
  batch.update(userRef(userId), {
    "stats.showsTracking": firestore.FieldValue.increment(1),
  });
  await batch.commit();
}

export async function removeFromWatchlist(userId: string, tmdbId: number) {
  const batch = db.batch();
  batch.delete(watchlistRef(userId).doc(String(tmdbId)));
  batch.update(userRef(userId), {
    "stats.showsTracking": firestore.FieldValue.increment(-1),
  });
  await batch.commit();
}

export async function stopWatching(userId: string, tmdbId: number, currentStatus: WatchStatus) {
  if (currentStatus === "rewatching") {
    await watchlistRef(userId).doc(String(tmdbId)).update({
      status: "paused_rewatch" as WatchStatus,
    });
  } else {
    await removeFromWatchlist(userId, tmdbId);
  }
}

export async function markEpisodeWatched(
  userId: string,
  tmdbShowId: number,
  season: number,
  episode: number,
  episodeTitle: string,
  runtime: number,
  nextEpisode: { season: number; episode: number } | null,
  isShowComplete: boolean
) {
  const docId = episodeDocId(tmdbShowId, season, episode);
  const epRef = watchedEpisodesRef(userId).doc(docId);
  const epDoc = await epRef.get();

  const batch = db.batch();

  if (epDoc.exists()) {
    batch.update(epRef, {
      watchCount: firestore.FieldValue.increment(1),
      lastWatchedAt: firestore.FieldValue.serverTimestamp(),
    });
  } else {
    batch.set(epRef, {
      tmdbShowId,
      season,
      episode,
      episodeTitle,
      watchedAt: firestore.FieldValue.serverTimestamp(),
      lastWatchedAt: firestore.FieldValue.serverTimestamp(),
      runtime,
      watchCount: 1,
    });
  }

  batch.update(userRef(userId), {
    "stats.episodesWatched": firestore.FieldValue.increment(1),
    "stats.totalMinutes": firestore.FieldValue.increment(runtime),
  });

  const watchlistUpdate: Record<string, unknown> = {
    lastWatchedAt: firestore.FieldValue.serverTimestamp(),
    nextEpisode,
  };
  if (isShowComplete) {
    watchlistUpdate.status = "completed";
  }
  batch.update(watchlistRef(userId).doc(String(tmdbShowId)), watchlistUpdate);

  await batch.commit();
}

export async function startRewatch(userId: string, tmdbId: number) {
  await watchlistRef(userId)
    .doc(String(tmdbId))
    .update({
      status: "rewatching" as WatchStatus,
      rewatchCount: firestore.FieldValue.increment(1),
      nextEpisode: { season: 1, episode: 1 },
      lastWatchedAt: firestore.FieldValue.serverTimestamp(),
    });
}

export async function resumeRewatch(userId: string, tmdbId: number) {
  await watchlistRef(userId).doc(String(tmdbId)).update({
    status: "rewatching" as WatchStatus,
  });
}

export { db, watchlistRef, watchedEpisodesRef, userRef };
```

- [ ] **Step 2: Verify compiles**

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit 2>&1 | grep "firestore.ts"`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/services/firestore.ts
git commit -m "feat: add inline stats updates via batch writes

Replace Cloud Function triggers with client-side batch writes.
addToWatchlist/removeFromWatchlist update showsTracking.
markEpisodeWatched updates episodesWatched and totalMinutes.
All operations are atomic via Firestore batch.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Add API Key Management to Profile Screen

**Files:**
- Modify: `app/src/screens/ProfileScreen.tsx`

**Interfaces:**
- Consumes: `useAuthStore.tmdbApiKey`, `useAuthStore.saveTmdbApiKey()` from Task 1
- Consumes: `validateApiKey()` from Task 2

- [ ] **Step 1: Update ProfileScreen with API key section**

Replace `app/src/screens/ProfileScreen.tsx`:

```typescript
import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useAuthStore } from "../stores/authStore";
import { useUserStats } from "../hooks/useUserStats";
import { useWatchlist } from "../hooks/useWatchlist";
import { validateApiKey } from "../services/tmdb";
import { colors, spacing, typography, posterSize } from "../theme";

export default function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const tmdbApiKey = useAuthStore((s) => s.tmdbApiKey);
  const saveTmdbApiKey = useAuthStore((s) => s.saveTmdbApiKey);
  const { stats } = useUserStats(user?.uid);
  const { items: watchlist } = useWatchlist(user?.uid);

  const [editingKey, setEditingKey] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);

  const completedShows = useMemo(
    () => watchlist.filter((w) => w.status === "completed"),
    [watchlist]
  );

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  };

  const handleSaveKey = async () => {
    const trimmed = newKey.trim();
    if (!trimmed || !user) return;

    setSaving(true);
    try {
      const valid = await validateApiKey(trimmed);
      if (!valid) {
        Alert.alert("Invalid API Key", "Could not validate this key with TMDB.");
        return;
      }
      await saveTmdbApiKey(user.uid, trimmed);
      setEditingKey(false);
      setNewKey("");
    } catch {
      Alert.alert("Error", "Failed to save API key.");
    } finally {
      setSaving(false);
    }
  };

  const maskedKey = tmdbApiKey
    ? `${tmdbApiKey.slice(0, 4)}${"*".repeat(Math.max(0, tmdbApiKey.length - 8))}${tmdbApiKey.slice(-4)}`
    : "Not set";

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        {user?.photoURL ? (
          <Image
            source={{ uri: user.photoURL }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarText}>
              {(user?.displayName || "?")[0].toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.name}>{user?.displayName || "User"}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats.episodesWatched}</Text>
          <Text style={styles.statLabel}>Episodes</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats.showsTracking}</Text>
          <Text style={styles.statLabel}>Tracking</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>
            {formatTime(stats.totalMinutes)}
          </Text>
          <Text style={styles.statLabel}>Watch Time</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>TMDB API Key</Text>
        {editingKey ? (
          <View>
            <TextInput
              style={styles.input}
              value={newKey}
              onChangeText={setNewKey}
              placeholder="Enter new TMDB API key"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!saving}
            />
            <View style={styles.keyActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => { setEditingKey(false); setNewKey(""); }}
                disabled={saving}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, (!newKey.trim() || saving) && styles.buttonDisabled]}
                onPress={handleSaveKey}
                disabled={!newKey.trim() || saving}
              >
                {saving ? (
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <Text style={styles.saveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.keyRow}>
            <Text style={styles.keyValue}>{maskedKey}</Text>
            <TouchableOpacity onPress={() => setEditingKey(true)}>
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {completedShows.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Completed ({completedShows.length})
          </Text>
          <View style={styles.completedGrid}>
            {completedShows.map((show) => (
              <Image
                key={show.id}
                source={{ uri: `${posterSize.small}${show.posterPath}` }}
                style={styles.completedPoster}
                contentFit="cover"
              />
            ))}
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    backgroundColor: colors.surfaceLight,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    ...typography.title,
    fontSize: 32,
  },
  name: {
    ...typography.title,
    marginTop: spacing.md,
  },
  email: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 12,
  },
  statBox: {
    alignItems: "center",
  },
  statNumber: {
    ...typography.title,
    fontSize: 20,
  },
  statLabel: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    ...typography.subtitle,
    marginBottom: spacing.md,
  },
  completedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  completedPoster: {
    width: 70,
    height: 105,
    borderRadius: 4,
  },
  keyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  keyValue: {
    ...typography.body,
    color: colors.textSecondary,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  editText: {
    ...typography.body,
    color: colors.accent,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  keyActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.md,
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  cancelText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    ...typography.body,
    color: colors.text,
    fontWeight: "600",
  },
  signOutButton: {
    marginTop: spacing.xxl,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xxl * 2,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 8,
    alignItems: "center",
  },
  signOutText: {
    ...typography.subtitle,
    color: colors.destructiveRed,
  },
});
```

- [ ] **Step 2: Add Platform import**

Note: The file uses `Platform.OS` in the `keyValue` style. Make sure `Platform` is imported — add it to the `react-native` import at the top:

```typescript
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
```

(This is already included in the full replacement above — verify it's there.)

- [ ] **Step 3: Verify compiles**

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit 2>&1 | grep "ProfileScreen"`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/ProfileScreen.tsx
git commit -m "feat: add TMDB API key management to profile screen

Shows masked key with edit option. Validates new key
against TMDB before saving. Matches existing dark theme.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Delete Cloud Functions and Clean Up Firebase Config

**Files:**
- Delete: `functions/` directory (entire)
- Modify: `firebase.json`
- Modify: `firestore.rules`
- Modify: `package.json` (root — remove functions scripts)
- Modify: `app/package.json` (remove @react-native-firebase/functions dep)

**Interfaces:**
- Consumes: Nothing — pure cleanup
- Produces: Clean project with no Cloud Functions references

- [ ] **Step 1: Delete functions directory**

Run: `rm -rf /Users/nolandmello/Documents/TV-TIME-SelfHosted-/functions`

- [ ] **Step 2: Update firebase.json — remove functions and functions emulator**

Replace `firebase.json`:

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "firestore": { "port": 8080 },
    "auth": { "port": 9099 },
    "ui": { "enabled": true }
  }
}
```

- [ ] **Step 3: Update firestore.rules — remove cache collection rules**

Replace `firestore.rules`:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // Users can only read/write their own profile
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;

      // Watchlist subcollection
      match /watchlist/{showId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      // Watched episodes subcollection
      match /watchedEpisodes/{episodeId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

- [ ] **Step 4: Update root package.json — remove functions scripts**

Replace root `package.json`:

```json
{
  "name": "tv-time-selfhosted",
  "private": true,
  "scripts": {
    "app:start": "cd app && npx expo start --dev-client",
    "app:android": "cd app && npx expo run:android",
    "app:ios": "cd app && npx expo run:ios"
  }
}
```

- [ ] **Step 5: Remove @react-native-firebase/functions from app dependencies**

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npm uninstall @react-native-firebase/functions`

- [ ] **Step 6: Verify no remaining references to Cloud Functions**

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/ && grep -r "firebase/functions" app/src/ --include="*.ts" --include="*.tsx"`
Expected: No matches.

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/ && grep -r "httpsCallable\|functions()" app/src/ --include="*.ts" --include="*.tsx"`
Expected: No matches.

- [ ] **Step 7: Verify TypeScript compiles clean**

Run: `cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-/app && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/nolandmello/Documents/TV-TIME-SelfHosted-
git add -A
git commit -m "chore: remove Cloud Functions and Blaze dependency

Delete entire functions/ directory (TMDB proxy, triggers, billing).
Remove functions config from firebase.json and emulators.
Remove cache collection rules from firestore.rules.
Remove functions scripts from root package.json.
Remove @react-native-firebase/functions from app dependencies.

App now runs entirely on Firebase Spark (free) plan.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Update Documentation

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: Nothing
- Produces: Updated docs reflecting new architecture

- [ ] **Step 1: Read current README**

Run: Read `README.md` to understand current structure before editing.

- [ ] **Step 2: Update README.md**

Key changes to make:
- Remove all references to Cloud Functions, Blaze plan, `functions:deploy`, `functions:build`
- Remove Firebase secrets setup (`firebase functions:secrets:set TMDB_API_KEY`)
- Add section explaining users enter their TMDB API key during onboarding
- Update setup instructions: no Blaze plan needed, just Spark
- Update architecture description: direct TMDB queries, no server-side code
- Remove billing/budget alert documentation

- [ ] **Step 3: Update .env.example**

Read current `.env.example` and remove `TMDB_API_KEY` line (key is now stored per-user in Firestore, not as env var).

- [ ] **Step 4: Commit**

```bash
git add README.md .env.example
git commit -m "docs: update README for Spark-only architecture

Remove Cloud Functions setup, Blaze plan references, and
Firebase secrets instructions. Document TMDB API key
onboarding flow.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
