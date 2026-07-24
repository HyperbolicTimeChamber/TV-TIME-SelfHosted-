import { create } from "zustand";

interface UiState {
  isConnected: boolean;
  setConnected: (connected: boolean) => void;
  watchlistLoading: boolean;
  setWatchlistLoading: (loading: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  isConnected: true,
  setConnected: (isConnected) => set({ isConnected }),
  watchlistLoading: true,
  setWatchlistLoading: (watchlistLoading) => set({ watchlistLoading }),
}));
