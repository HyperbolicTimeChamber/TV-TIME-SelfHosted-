import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface UiState {
	isConnected: boolean;
	watchlistLoading: boolean;
	/** Full-screen pages (not-found) hide the tab bar */
	tabBarHidden: boolean;
}

const uiSlice = createSlice({
	name: "ui",
	initialState: { isConnected: true, watchlistLoading: true, tabBarHidden: false } as UiState,
	reducers: {
		setConnected(state, action: PayloadAction<boolean>) {
			state.isConnected = action.payload;
		},
		setWatchlistLoading(state, action: PayloadAction<boolean>) {
			state.watchlistLoading = action.payload;
		},
		setTabBarHidden(state, action: PayloadAction<boolean>) {
			state.tabBarHidden = action.payload;
		},
	},
});

export const { setConnected, setWatchlistLoading, setTabBarHidden } = uiSlice.actions;
export default uiSlice.reducer;
