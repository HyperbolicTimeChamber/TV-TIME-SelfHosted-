import { create } from "zustand";

interface UiState {
	/** Debounced (connectivityGate): false only after OFFLINE_DELAY_MS offline; unknown = true */
	isConnected: boolean;
	setConnected: (connected: boolean) => void;
	/** "No Internet" popup — opened by requireOnline when an action is tried offline */
	noInternetVisible: boolean;
	setNoInternetVisible: (visible: boolean) => void;
	watchlistLoading: boolean;
	setWatchlistLoading: (loading: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
	isConnected: true,
	setConnected: (isConnected) => set({ isConnected }),
	noInternetVisible: false,
	setNoInternetVisible: (noInternetVisible) => set({ noInternetVisible }),
	watchlistLoading: true,
	setWatchlistLoading: (watchlistLoading) => set({ watchlistLoading }),
}));
