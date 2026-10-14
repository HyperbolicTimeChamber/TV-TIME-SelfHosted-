import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { doc, getDoc, getFirestore } from "firebase/firestore";
import { TMDB_PROXY_KEY } from "@app/enums";
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

export const loadUserFlags = createAsyncThunk("auth/loadUserFlags", async (uid: string) => {
	const snap = await getDoc(doc(getFirestore(), "users", uid));
	return { hasCompletedImport: Boolean(snap.exists() && snap.data()?.hasCompletedImport) };
});

const authSlice = createSlice({
	name: "auth",
	initialState: initialAuthState,
	reducers: {
		userChanged(state, action: PayloadAction<AuthUser | null>) {
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
			state.userFlagsLoading = false;
		});
		b.addCase(loadUserFlags.rejected, (state) => {
			state.userFlagsLoading = false;
		});
	},
});

export const { userChanged, importCompleted } = authSlice.actions;
export default authSlice.reducer;
