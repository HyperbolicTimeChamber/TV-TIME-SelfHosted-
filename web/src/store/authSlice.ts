import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { doc, getDoc, getFirestore, setDoc } from "../platform/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { TMDB_PROXY_KEY } from "@app/enums";
import {
	DEFAULT_PROFILE_PREFS,
	mergeProfilePrefs,
	parseCachedPrefs,
	prefsFromDoc,
	profilePrefsDocFields,
	profilePrefsKey,
	type ProfilePrefs,
} from "@app/utils/profilePrefs";
import "../firebase";

/** Serializable subset of the Firebase user (Redux state must be plain data) */
export interface AuthUser {
	uid: string;
	email: string | null;
	displayName: string | null;
	photoURL: string | null;
	providerData: Array<{ providerId: string }>;
}

export interface AuthState {
	user: AuthUser | null;
	loading: boolean;
	/** Logged in: key from config/app. Guest: TMDB_PROXY_KEY → requests go via tmdbProxy CF */
	appTmdbApiKey: string | null;
	appTmdbApiKeyLoading: boolean;
	hasCompletedImport: boolean;
	userFlagsLoading: boolean;
	/** Settings -> Profile (users/{uid} doc, kept in localStorage for an instant first render) */
	profilePrefs: ProfilePrefs;
	minVersion: string | null;
	lastCatalogSync: string | null;
	previousCatalogSync: string | null;
	changedShowIds: string[] | null;
}

const guestConfig = {
	appTmdbApiKey: TMDB_PROXY_KEY,
	appTmdbApiKeyLoading: false,
	minVersion: null,
	lastCatalogSync: null,
	previousCatalogSync: null,
	changedShowIds: null,
};

export const initialAuthState: AuthState = {
	user: null,
	loading: true,
	hasCompletedImport: false,
	userFlagsLoading: false,
	profilePrefs: DEFAULT_PROFILE_PREFS,
	...guestConfig,
};

const isoOf = (ts: any): string | null => ts?.toDate?.()?.toISOString?.() ?? null;

/** Same config/app read as the mobile app — only when signed in (rules require auth) */
export const loadAppConfig = createAsyncThunk("auth/loadAppConfig", async () => {
	const snap = await getDoc(doc(getFirestore(), "config", "app"));
	const data = snap.exists() ? snap.data() : {};
	return {
		appTmdbApiKey: (data.tmdbApiKey as string) ?? null,
		minVersion: (data.minVersion as string) ?? null,
		lastCatalogSync: isoOf(data.lastCatalogSync),
		previousCatalogSync: isoOf(data.previousCatalogSync),
		changedShowIds: Array.isArray(data.changedShowIds) ? (data.changedShowIds as string[]) : null,
	};
});

/** The saved Profile settings (localStorage): dispatched with loadUserFlags so the profile draws at once */
export const loadCachedProfilePrefs = createAsyncThunk(
	"auth/loadCachedProfilePrefs",
	async (uid: string) => parseCachedPrefs(await AsyncStorage.getItem(profilePrefsKey(uid)).catch(() => null)),
);

export const loadUserFlags = createAsyncThunk("auth/loadUserFlags", async (uid: string) => {
	const snap = await getDoc(doc(getFirestore(), "users", uid));
	// Profile settings ride on the same doc read (no extra read); kept for the next visit
	const profilePrefs = prefsFromDoc(snap.exists() ? snap.data() : undefined);
	AsyncStorage.setItem(profilePrefsKey(uid), JSON.stringify(profilePrefs)).catch(() => {});
	return {
		hasCompletedImport: Boolean(snap.exists() && snap.data()?.hasCompletedImport),
		profilePrefs,
	};
});

/** Settings -> Profile change: the optimistic update is the pending case below (callers run
 *  requireOnline first); this keeps it on the device and saves it on the user doc */
export const saveProfilePrefs = createAsyncThunk(
	"auth/saveProfilePrefs",
	async (arg: { uid: string; patch: Partial<ProfilePrefs> }, { getState }) => {
		const { profilePrefs } = (getState() as { auth: AuthState }).auth;
		AsyncStorage.setItem(profilePrefsKey(arg.uid), JSON.stringify(profilePrefs)).catch(() => {});
		await setDoc(doc(getFirestore(), "users", arg.uid), profilePrefsDocFields(arg.patch), {
			merge: true,
		});
	},
);

const authSlice = createSlice({
	name: "auth",
	initialState: initialAuthState,
	reducers: {
		userChanged(state, action: PayloadAction<AuthUser | null>) {
			// Another account (or none): its own settings, not the previous one's
			if (state.user?.uid !== action.payload?.uid) state.profilePrefs = DEFAULT_PROFILE_PREFS;
			state.user = action.payload;
			state.loading = false;
			if (action.payload) {
				state.appTmdbApiKeyLoading = true;
				state.userFlagsLoading = true;
			} else {
				Object.assign(state, guestConfig, { hasCompletedImport: false, userFlagsLoading: false });
			}
		},
		importCompleted(state) {
			state.hasCompletedImport = true;
		},
	},
	extraReducers: (b) => {
		b.addCase(loadAppConfig.fulfilled, (state, { payload }) => {
			Object.assign(state, payload, { appTmdbApiKeyLoading: false });
		});
		// Config unreadable → keep working through the proxy
		b.addCase(loadAppConfig.rejected, (state) => {
			state.appTmdbApiKey = state.appTmdbApiKey ?? TMDB_PROXY_KEY;
			state.appTmdbApiKeyLoading = false;
		});
		b.addCase(loadUserFlags.fulfilled, (state, { payload }) => {
			state.hasCompletedImport = payload.hasCompletedImport;
			state.profilePrefs = payload.profilePrefs;
			state.userFlagsLoading = false;
		});
		b.addCase(loadCachedProfilePrefs.fulfilled, (state, { payload }) => {
			state.profilePrefs = payload;
		});
		// Optimistic: applied the moment the change is made
		b.addCase(saveProfilePrefs.pending, (state, { meta }) => {
			state.profilePrefs = mergeProfilePrefs(state.profilePrefs, meta.arg.patch);
		});
		b.addCase(loadUserFlags.rejected, (state) => {
			state.userFlagsLoading = false;
		});
	},
});

export const { userChanged, importCompleted } = authSlice.actions;
export default authSlice.reducer;
