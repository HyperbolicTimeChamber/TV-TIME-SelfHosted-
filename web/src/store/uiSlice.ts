import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface UiState {
	isConnected: boolean;
	watchlistLoading: boolean;
}

const uiSlice = createSlice({
	name: "ui",
	initialState: { isConnected: true, watchlistLoading: true } as UiState,
	reducers: {
		setConnected(state, action: PayloadAction<boolean>) {
			state.isConnected = action.payload;
		},
		setWatchlistLoading(state, action: PayloadAction<boolean>) {
			state.watchlistLoading = action.payload;
		},
	},
});

export const { setConnected, setWatchlistLoading } = uiSlice.actions;
export default uiSlice.reducer;
