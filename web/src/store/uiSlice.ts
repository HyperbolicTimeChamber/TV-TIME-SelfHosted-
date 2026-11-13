import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface UiState {
	/** Debounced (connectivityGate): false only after OFFLINE_DELAY_MS offline */
	isConnected: boolean;
	/** "No Internet" popup — opened by requireOnline when an action is tried offline */
	noInternetVisible: boolean;
	watchlistLoading: boolean;
	/** Full-screen pages (not-found) hide the tab bar */
	tabBarHidden: boolean;
}

const uiSlice = createSlice({
	name: "ui",
	initialState: {
		isConnected: true,
		noInternetVisible: false,
		watchlistLoading: true,
		tabBarHidden: false,
	} as UiState,
	reducers: {
		setConnected(state, action: PayloadAction<boolean>) {
			state.isConnected = action.payload;
		},
		setNoInternetVisible(state, action: PayloadAction<boolean>) {
			state.noInternetVisible = action.payload;
		},
		setWatchlistLoading(state, action: PayloadAction<boolean>) {
			state.watchlistLoading = action.payload;
		},
		setTabBarHidden(state, action: PayloadAction<boolean>) {
			state.tabBarHidden = action.payload;
		},
	},
});

export const { setConnected, setNoInternetVisible, setWatchlistLoading, setTabBarHidden } =
	uiSlice.actions;

export default uiSlice.reducer;
